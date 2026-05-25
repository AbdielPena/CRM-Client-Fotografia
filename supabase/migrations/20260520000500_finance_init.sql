-- ============================================================================
-- Finance — schema completo del módulo (port de finanzapp)
--
-- Tablas con prefijo `fin_`. Multi-tenant: studio_id NOT NULL en TODAS.
-- RLS via public.is_studio_member(studio_id). Triggers updated_at vía
-- public.set_updated_at() del repo.
--
-- Reuso del CRM:
--   - fin_receivables.client_id → public.clients (FK opcional)
--   - fin_transactions.invoice_id → public.invoices (FK opcional, para
--     correlación cuando se paga una invoice y se crea income idempotente)
--   - fin_payables: si tu acreedor es un proveedor con cuenta en el CRM,
--     puedes usar fin_payables.beneficiary_id → fin_beneficiaries
--
-- NO se portan (gobernadas por el monolito):
--   - users / refresh_tokens (auth.users)
--   - workspaces / workspace_members / plans (studios + studio_members)
--   - audit_logs (activity_log existente)
--   - notifications (notifications existente, agregar nuevos types)
--
-- Money: NUMERIC(14,2) NUNCA float (consistente con el resto del repo).
-- Cálculos en TS via lib/decimal.ts (decimal.js, banker's rounding).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- 1. ENTIDADES FINANCIERAS CORE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fin_banks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  color           TEXT,                                -- hex for UI rendering
  icono           TEXT,                                -- emoji or asset key
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (studio_id, nombre)
);
CREATE INDEX IF NOT EXISTS ix_fin_banks_studio ON public.fin_banks(studio_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.fin_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  banco_id        UUID NOT NULL REFERENCES public.fin_banks(id) ON DELETE RESTRICT,
  nombre          TEXT NOT NULL,
  tipo            TEXT CHECK (tipo IS NULL OR tipo IN ('ahorro','corriente','nomina','efectivo','digital','otro')),
  saldo_inicial   NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'DOP',
  activa          BOOLEAN NOT NULL DEFAULT TRUE,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_fin_accounts_studio ON public.fin_accounts(studio_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_fin_accounts_bank ON public.fin_accounts(banco_id);

CREATE TABLE IF NOT EXISTS public.fin_cards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id         UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  banco_id          UUID REFERENCES public.fin_banks(id) ON DELETE SET NULL,
  nombre            TEXT NOT NULL,
  limite_credito    NUMERIC(14,2) NOT NULL DEFAULT 0,
  limite_sobregiro  NUMERIC(14,2),
  saldo_usado       NUMERIC(14,2) NOT NULL DEFAULT 0,
  tasa_interes      NUMERIC(5,2),
  dia_corte         SMALLINT CHECK (dia_corte IS NULL OR dia_corte BETWEEN 1 AND 31),
  dia_pago          SMALLINT CHECK (dia_pago IS NULL OR dia_pago BETWEEN 1 AND 31),
  currency          TEXT NOT NULL DEFAULT 'DOP',
  activa            BOOLEAN NOT NULL DEFAULT TRUE,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_fin_cards_studio ON public.fin_cards(studio_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.fin_external_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  titular         TEXT NOT NULL,
  banco           TEXT,
  nombre          TEXT NOT NULL,
  limite          NUMERIC(14,2),
  saldo_usado     NUMERIC(14,2) NOT NULL DEFAULT 0,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_fin_extcards_studio ON public.fin_external_cards(studio_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.fin_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('ingreso','gasto','ambos')),
  emoji           TEXT,
  color           TEXT,
  es_sistema      BOOLEAN NOT NULL DEFAULT FALSE,
  is_business     BOOLEAN NOT NULL DEFAULT TRUE,        -- vista contable del studio (legacy de finanzapp hub_integration)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (studio_id, nombre)
);
CREATE INDEX IF NOT EXISTS ix_fin_categories_studio ON public.fin_categories(studio_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.fin_beneficiaries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (studio_id, nombre)
);

-- ============================================================================
-- 2. TRANSACCIONES — el corazón del módulo
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fin_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id           UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  tipo                TEXT NOT NULL CHECK (tipo IN ('ingreso','gasto','transferencia')),
  monto               NUMERIC(14,2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'DOP',
  descripcion         TEXT,
  fecha               DATE NOT NULL,
  categoria_id        UUID REFERENCES public.fin_categories(id) ON DELETE SET NULL,
  cuenta_id           UUID REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  cuenta_destino_id   UUID REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  tarjeta_id          UUID REFERENCES public.fin_cards(id) ON DELETE SET NULL,
  tipo_ingreso        TEXT,                            -- 'personal'|'cliente'|'salario'|'prestamo'|'otro'
  -- Correlación cross-módulo: cuando un invoice del CRM se paga, se crea un
  -- fin_transactions de tipo='ingreso' idempotente con external_reference único
  invoice_id          UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  external_reference  TEXT,                            -- 'invoice:<uuid>' o similar, UNIQUE
  aplica_diezmo       BOOLEAN NOT NULL DEFAULT FALSE,
  estado              TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','hold','anulado')),
  is_business         BOOLEAN NOT NULL DEFAULT TRUE,    -- vista contable
  notas               TEXT,
  beneficiarios       JSONB,                            -- array of {beneficiary_id, nombre, monto}
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_fin_tx_studio_fecha
  ON public.fin_transactions(studio_id, fecha DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_fin_tx_cuenta
  ON public.fin_transactions(cuenta_id) WHERE cuenta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fin_tx_tarjeta
  ON public.fin_transactions(tarjeta_id) WHERE tarjeta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fin_tx_categoria
  ON public.fin_transactions(categoria_id) WHERE categoria_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fin_tx_invoice
  ON public.fin_transactions(invoice_id) WHERE invoice_id IS NOT NULL;
-- UNIQUE en external_reference por studio: idempotencia de invoice→income
CREATE UNIQUE INDEX IF NOT EXISTS ux_fin_tx_external_ref
  ON public.fin_transactions(studio_id, external_reference)
  WHERE external_reference IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- 3. SUSCRIPCIONES Y CARGOS RECURRENTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fin_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  monto           NUMERIC(14,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'DOP',
  frecuencia      TEXT NOT NULL CHECK (frecuencia IN ('semanal','quincenal','mensual','bimestral','trimestral','semestral','anual')),
  dia_cobro       SMALLINT,
  cuenta_id       UUID REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  tarjeta_id      UUID REFERENCES public.fin_cards(id) ON DELETE SET NULL,
  categoria_id   UUID REFERENCES public.fin_categories(id) ON DELETE SET NULL,
  proxima_fecha  DATE,
  activa          BOOLEAN NOT NULL DEFAULT TRUE,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_fin_subs_studio ON public.fin_subscriptions(studio_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.fin_subscription_charges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.fin_subscriptions(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  monto           NUMERIC(14,2) NOT NULL,
  pagado          BOOLEAN NOT NULL DEFAULT FALSE,
  transaction_id  UUID REFERENCES public.fin_transactions(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fin_sub_charges_sub ON public.fin_subscription_charges(subscription_id);

-- ============================================================================
-- 4. DEUDAS Y PRÉSTAMOS (CxC/CxP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fin_debts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id           UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  acreedor            TEXT NOT NULL,
  monto_original      NUMERIC(14,2) NOT NULL,
  saldo_pendiente     NUMERIC(14,2) NOT NULL,
  cuotas_total        INT,
  cuotas_pagadas      INT NOT NULL DEFAULT 0,
  monto_cuota         NUMERIC(14,2),
  tasa_interes        NUMERIC(5,2),
  currency            TEXT NOT NULL DEFAULT 'DOP',
  fecha_inicio        DATE,
  fecha_proximo_pago  DATE,
  estado              TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','pagada','reestructurada','cancelada')),
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_fin_debts_studio_estado
  ON public.fin_debts(studio_id, estado) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.fin_debt_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  debt_id         UUID NOT NULL REFERENCES public.fin_debts(id) ON DELETE CASCADE,
  monto           NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  fecha           DATE NOT NULL,
  cuenta_id       UUID REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  transaction_id  UUID REFERENCES public.fin_transactions(id) ON DELETE SET NULL,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fin_debt_pay_debt ON public.fin_debt_payments(debt_id);

CREATE TABLE IF NOT EXISTS public.fin_debt_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  configuracion   JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fin_loans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  deudor          TEXT NOT NULL,                       -- a quien le prestaste
  monto_original  NUMERIC(14,2) NOT NULL,
  saldo_pendiente NUMERIC(14,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'DOP',
  fecha_inicio    DATE,
  estado          TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','cobrado','perdido','cancelado')),
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_fin_loans_studio ON public.fin_loans(studio_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.fin_loan_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  loan_id         UUID NOT NULL REFERENCES public.fin_loans(id) ON DELETE CASCADE,
  monto           NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  fecha           DATE NOT NULL,
  cuenta_id       UUID REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  transaction_id  UUID REFERENCES public.fin_transactions(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fin_loan_pay_loan ON public.fin_loan_payments(loan_id);

-- ============================================================================
-- 5. CUENTAS POR COBRAR / PAGAR
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fin_receivables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  -- Reuso CRM: si el receivable corresponde a un client del CRM, lo
  -- referenciamos. Si es un cliente puntual (no en CRM), client_id=NULL.
  client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  cliente         TEXT NOT NULL,                       -- snapshot del nombre
  invoice_id      UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  monto           NUMERIC(14,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'DOP',
  fecha_emision   DATE,
  fecha_venc      DATE,
  estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','parcial','cobrada','cancelada','vencida')),
  monto_cobrado   NUMERIC(14,2) NOT NULL DEFAULT 0,
  notas           TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_fin_recv_studio_estado
  ON public.fin_receivables(studio_id, estado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_fin_recv_client ON public.fin_receivables(client_id) WHERE client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fin_payables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  beneficiary_id  UUID REFERENCES public.fin_beneficiaries(id) ON DELETE SET NULL,
  acreedor        TEXT NOT NULL,                       -- snapshot
  monto           NUMERIC(14,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'DOP',
  fecha_emision   DATE,
  fecha_venc      DATE,
  estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','parcial','pagada','cancelada','vencida')),
  monto_pagado    NUMERIC(14,2) NOT NULL DEFAULT 0,
  notas           TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_fin_pay_studio_estado
  ON public.fin_payables(studio_id, estado) WHERE deleted_at IS NULL;

-- ============================================================================
-- 6. METAS, DIEZMO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fin_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  monto_objetivo  NUMERIC(14,2) NOT NULL,
  monto_actual    NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'DOP',
  fecha_objetivo  DATE,
  cuenta_id       UUID REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  estado          TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','completada','pausada','cancelada')),
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_fin_goals_studio ON public.fin_goals(studio_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.fin_goal_contributions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  goal_id         UUID NOT NULL REFERENCES public.fin_goals(id) ON DELETE CASCADE,
  monto           NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  fecha           DATE NOT NULL,
  transaction_id  UUID REFERENCES public.fin_transactions(id) ON DELETE SET NULL,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fin_goal_contrib_goal ON public.fin_goal_contributions(goal_id);

CREATE TABLE IF NOT EXISTS public.fin_tithe (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  base_calculo    NUMERIC(14,2) NOT NULL,
  monto_diezmo    NUMERIC(14,2) NOT NULL,
  pagado          BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_pago      DATE,
  transaction_id  UUID REFERENCES public.fin_transactions(id) ON DELETE SET NULL,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fin_tithe_studio ON public.fin_tithe(studio_id);

-- ============================================================================
-- 7. TRIGGERS updated_at (todos vía public.set_updated_at del repo)
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fin_banks','fin_accounts','fin_cards','fin_external_cards',
    'fin_categories','fin_beneficiaries','fin_transactions',
    'fin_subscriptions','fin_debts','fin_debt_templates','fin_loans',
    'fin_receivables','fin_payables','fin_goals','fin_tithe'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- 8. RLS — habilitar + policy member_all en TODAS las tablas fin_*
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fin_banks','fin_accounts','fin_cards','fin_external_cards',
    'fin_categories','fin_beneficiaries','fin_transactions',
    'fin_subscriptions','fin_subscription_charges',
    'fin_debts','fin_debt_payments','fin_debt_templates',
    'fin_loans','fin_loan_payments',
    'fin_receivables','fin_payables',
    'fin_goals','fin_goal_contributions','fin_tithe'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_member_all ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_member_all ON public.%I FOR ALL USING (public.is_studio_member(studio_id)) WITH CHECK (public.is_studio_member(studio_id));',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- 9. RPC compute_account_balance — agregado para dashboards
-- ============================================================================
--
-- Saldo de una cuenta = saldo_inicial + Σ(transacciones que la afectan).
-- Útil para dashboards y reportes. NO mutate state, solo read.
--
CREATE OR REPLACE FUNCTION public.fin_compute_account_balance(
  p_studio_id  UUID,
  p_account_id UUID,
  p_as_of      TIMESTAMPTZ DEFAULT NULL
) RETURNS NUMERIC(14,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_initial   NUMERIC(14,2);
  v_ingresos  NUMERIC(14,2);
  v_gastos    NUMERIC(14,2);
  v_transfers_in  NUMERIC(14,2);
  v_transfers_out NUMERIC(14,2);
  v_cutoff TIMESTAMPTZ := COALESCE(p_as_of, NOW());
BEGIN
  SELECT saldo_inicial INTO v_initial
  FROM public.fin_accounts
  WHERE id = p_account_id AND studio_id = p_studio_id AND deleted_at IS NULL;

  IF v_initial IS NULL THEN
    RAISE EXCEPTION 'FIN_ACCOUNT_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_ingresos
  FROM public.fin_transactions
  WHERE studio_id = p_studio_id
    AND cuenta_id = p_account_id
    AND tipo = 'ingreso'
    AND estado = 'activo'
    AND deleted_at IS NULL
    AND created_at <= v_cutoff;

  SELECT COALESCE(SUM(monto), 0) INTO v_gastos
  FROM public.fin_transactions
  WHERE studio_id = p_studio_id
    AND cuenta_id = p_account_id
    AND tipo = 'gasto'
    AND estado = 'activo'
    AND deleted_at IS NULL
    AND created_at <= v_cutoff;

  SELECT COALESCE(SUM(monto), 0) INTO v_transfers_in
  FROM public.fin_transactions
  WHERE studio_id = p_studio_id
    AND cuenta_destino_id = p_account_id
    AND tipo = 'transferencia'
    AND estado = 'activo'
    AND deleted_at IS NULL
    AND created_at <= v_cutoff;

  SELECT COALESCE(SUM(monto), 0) INTO v_transfers_out
  FROM public.fin_transactions
  WHERE studio_id = p_studio_id
    AND cuenta_id = p_account_id
    AND tipo = 'transferencia'
    AND estado = 'activo'
    AND deleted_at IS NULL
    AND created_at <= v_cutoff;

  RETURN v_initial + v_ingresos - v_gastos + v_transfers_in - v_transfers_out;
END;
$$;

COMMENT ON FUNCTION public.fin_compute_account_balance IS
  'Calcula el balance actual de una cuenta financiera. saldo_inicial + sum(ingresos) - sum(gastos) +/- transferencias. Excluye soft-deleted y status=hold/anulado.';

GRANT EXECUTE ON FUNCTION public.fin_compute_account_balance(UUID, UUID, TIMESTAMPTZ) TO authenticated;

-- ============================================================================
-- Comentarios finales
-- ============================================================================
COMMENT ON TABLE public.fin_transactions IS
  'Heart of finance module. Multi-tenant via studio_id. external_reference + UNIQUE garantiza idempotencia para invoice.paid → income (F4 integration).';
COMMENT ON TABLE public.fin_receivables IS
  'CxC. Si invoice_id está presente, es una factura del CRM esperando cobro. Si client_id está presente, se enlaza a contact del CRM.';
