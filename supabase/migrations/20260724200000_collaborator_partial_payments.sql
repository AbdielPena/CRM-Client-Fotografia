-- ============================================================================
-- Colaboradores: deuda al PASAR la sesión + pagos parciales (abonos)
-- ============================================================================
-- Cambio pedido por Abdiel (2026-07-24):
--   1. La deuda con el colaborador NO nace al asignarlo, sino cuando la fecha
--      de la sesión ya pasó (antes se creaba el payable al asignar, aunque la
--      sesión fuera meses después).
--   2. Poder registrar el pago completo, PARCIAL (abonos) o manual.
--   3. Solo cuentan las sesiones desde la fecha de corte en adelante.
--
-- REGLA DE ORO: esta migración es ADITIVA e IDEMPOTENTE. No borra ni renombra
-- nada. Se puede correr varias veces sin daño.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. project_collaborators: abonos + sellos de control
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_collaborators
  -- Suma de los abonos registrados (la fuente real son las filas de
  -- collaborator_payment_entries; esta columna es el acumulado para leer rápido).
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  -- Cuándo nació la deuda (la sesión ya pasó y se empujó a FinanzApp).
  -- NULL = todavía no se debe nada. Es EL filtro de "pendiente".
  ADD COLUMN IF NOT EXISTS debt_registered_at timestamptz,
  -- Cuándo se le avisó por correo del pendiente (idempotencia del correo).
  ADD COLUMN IF NOT EXISTS pending_notified_at timestamptz;

-- pay_status necesita aceptar 'partial'. Se localiza el CHECK actual por su
-- definición (el nombre puede variar) para no dejar dos reglas peleando.
DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'project_collaborators'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%pay_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.project_collaborators DROP CONSTRAINT %I', v_conname);
  END LOOP;

  ALTER TABLE public.project_collaborators
    ADD CONSTRAINT project_collaborators_pay_status_check
    CHECK (pay_status IN ('pending', 'partial', 'paid', 'cancelled'));
END$$;

-- ---------------------------------------------------------------------------
-- 2. Fecha de corte por estudio
-- ---------------------------------------------------------------------------
-- Las sesiones ANTERIORES a esta fecha nunca generan deuda automática
-- ("las que ya pasaron no se suman; de ahora en adelante solo las futuras").
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS collab_debt_start_date date;

-- ---------------------------------------------------------------------------
-- 3. Abonos (un registro por pago; permite parciales)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.collaborator_payment_entries (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id               uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  collaborator_id         uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE RESTRICT,
  -- Abono contra la asignación a una sesión.
  project_collaborator_id uuid REFERENCES public.project_collaborators(id) ON DELETE CASCADE,
  amount                  numeric(12,2) NOT NULL CHECK (amount > 0),
  method                  text,
  paid_on                 date NOT NULL DEFAULT CURRENT_DATE,
  note                    text,
  -- Número de recibo que ve el colaborador en su correo.
  receipt_number          text,
  -- Referencia del gasto espejado en FinanzApp (crm-collab-pay:<id>).
  finanzapp_tx_ref        text,
  receipt_sent_at         timestamptz,
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_collab_pay_entries_assignment
  ON public.collaborator_payment_entries (project_collaborator_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_collab_pay_entries_studio
  ON public.collaborator_payment_entries (studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collab_pay_entries_collaborator
  ON public.collaborator_payment_entries (collaborator_id)
  WHERE deleted_at IS NULL;

-- Mismo patrón que el resto del módulo: RLS activo sin políticas
-- (deny-by-default). Todo el acceso es service-role desde el servidor.
ALTER TABLE public.collaborator_payment_entries ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. RPC: registrar un ABONO en FinanzApp (gasto real) y, si salda, cerrar
--    la cuenta por pagar SIN crear un segundo gasto.
-- ---------------------------------------------------------------------------
-- finz_settle_payable ya existente crea el gasto por el monto TOTAL y usa la
-- referencia crm-collab-pay:<assignmentId>. Para abonos hace falta un gasto por
-- CADA pago, con su propia referencia, y marcar la cuenta como pagada solo al
-- completarse. Por eso esta función nueva: NO se toca ninguna de las existentes.
CREATE OR REPLACE FUNCTION public.finz_record_collab_payment(
  p_workspace_id      uuid,
  p_external_reference text,    -- crm-collab-pay:<entryId>  (idempotencia)
  p_payable_reference  text,    -- crm-collab:<assignmentId> (a cuál deuda aplica)
  p_monto             numeric,
  p_fecha             date DEFAULT NULL,
  p_cuenta_id         uuid DEFAULT NULL,
  p_descripcion       text DEFAULT NULL,
  p_notas             text DEFAULT NULL,
  p_settle            boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'finanzapp', 'public'
AS $function$
declare
  v_tx_id       uuid;
  v_existing_tx uuid;
  v_cuenta      uuid := null;
  v_categoria   uuid;
  v_payable_id  uuid;
begin
  if p_workspace_id is null or coalesce(p_external_reference, '') = '' then
    raise exception 'FINZ_INVALID_INPUT';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'FINZ_INVALID_AMOUNT';
  end if;

  -- Idempotencia: si el abono ya se registró, no se duplica.
  select id into v_existing_tx
  from finanzapp.transactions
  where external_reference = p_external_reference
    and workspace_id = p_workspace_id
  limit 1;

  if v_existing_tx is null then
    if p_cuenta_id is not null then
      select a.id into v_cuenta
      from finanzapp.accounts a
      where a.id = p_cuenta_id and a.workspace_id = p_workspace_id
        and a.activa = true and a.deleted_at is null;
    end if;

    select c.id into v_categoria
    from finanzapp.categories c
    where c.workspace_id = p_workspace_id and c.tipo = 'gasto'
      and c.deleted_at is null
    order by (c.nombre ~* 'colabor|personal|servici|equipo|nomina|salar') desc,
             c.es_sistema desc, c.nombre
    limit 1;

    begin
      insert into finanzapp.transactions (
        workspace_id, tipo, monto, descripcion, fecha,
        categoria_id, cuenta_id, estado, notas, external_reference, is_business
      ) values (
        p_workspace_id, 'gasto', round(p_monto, 2),
        coalesce(p_descripcion, 'Pago a colaborador (CRM)'),
        coalesce(p_fecha, current_date),
        v_categoria, v_cuenta, 'activo',
        coalesce(p_notas, 'Registrado automáticamente desde el CRM (colaborador)'),
        p_external_reference, false
      )
      returning id into v_tx_id;
    exception when unique_violation then
      select id into v_tx_id
      from finanzapp.transactions
      where external_reference = p_external_reference
        and workspace_id = p_workspace_id
      limit 1;
    end;
  else
    v_tx_id := v_existing_tx;
  end if;

  -- Saldar la cuenta por pagar (sin crear otro gasto: ya lo hicimos arriba).
  if p_settle and coalesce(p_payable_reference, '') <> '' then
    update finanzapp.payables
      set estado = 'pagada', updated_at = now()
    where workspace_id = p_workspace_id
      and external_reference = p_payable_reference
      and estado <> 'pagada'
    returning id into v_payable_id;
  end if;

  return jsonb_build_object(
    'transaction_id',  v_tx_id,
    'already_existed', v_existing_tx is not null,
    'payable_settled', v_payable_id is not null
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.finz_record_collab_payment(uuid, text, text, numeric, date, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finz_record_collab_payment(uuid, text, text, numeric, date, uuid, text, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.finz_record_collab_payment(uuid, text, text, numeric, date, uuid, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finz_record_collab_payment(uuid, text, text, numeric, date, uuid, text, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Coherencia de datos existentes
-- ---------------------------------------------------------------------------
-- Las asignaciones ya marcadas 'paid' antes de este cambio se consideran
-- saldadas: su deuda ya nació y está cubierta por completo.
UPDATE public.project_collaborators
SET debt_registered_at = COALESCE(debt_registered_at, COALESCE(paid_at, updated_at, created_at)),
    paid_amount        = CASE WHEN paid_amount = 0 THEN agreed_pay ELSE paid_amount END
WHERE pay_status = 'paid'
  AND deleted_at IS NULL
  AND debt_registered_at IS NULL;
