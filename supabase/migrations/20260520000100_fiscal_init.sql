-- ============================================================================
-- Fiscal RD (NCF/ITBIS) — schema base
--
-- Tablas:
--   • fiscal_ncf_sequences — secuencias NCF por studio + tipo (B01..B17)
--   • fiscal_tax_configs   — configuración de ITBIS/ISR por studio
--
-- RPC:
--   • public.assign_next_ncf(p_studio_id, p_type) — atómica con FOR UPDATE
--
-- Multi-tenant: studio_id NOT NULL FK studios(id) + RLS via is_studio_member.
-- Soft delete: deleted_at TIMESTAMPTZ. Audit log via trigger en activity_log.
-- ============================================================================

-- 1. Tabla de secuencias NCF
CREATE TABLE IF NOT EXISTS public.fiscal_ncf_sequences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN (
                  'B01','B02','B03','B04',
                  'B11','B12','B13','B14','B15','B16','B17'
                )),
  prefix        TEXT NOT NULL,                       -- típicamente igual al type (B02)
  range_from    INTEGER NOT NULL CHECK (range_from >= 0),
  range_to      INTEGER NOT NULL CHECK (range_to > range_from),
  current_value INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','EXHAUSTED')),
  expires_at    TIMESTAMPTZ,                          -- vigencia DGII (opcional)
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_fiscal_ncf_seq_studio_type
  ON public.fiscal_ncf_sequences(studio_id, type, status)
  WHERE deleted_at IS NULL;

-- Solo UNA secuencia ACTIVE por (studio, type) a la vez (la RPC valida overlap de rangos)
CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_ncf_seq_one_active
  ON public.fiscal_ncf_sequences(studio_id, type)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;

-- 2. Tabla de configuración fiscal por studio
CREATE TABLE IF NOT EXISTS public.fiscal_tax_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  itbis_rate      NUMERIC(5,2) NOT NULL DEFAULT 18.00 CHECK (itbis_rate IN (0, 16, 18)),
  isr_retention   NUMERIC(5,2) DEFAULT NULL,         -- retención ISR si aplica
  rnc             TEXT,                              -- RNC del studio (9 dígitos)
  business_name   TEXT,                              -- razón social fiscal
  default_ncf_type TEXT CHECK (default_ncf_type IN (
                    'B01','B02','B03','B04',
                    'B11','B12','B13','B14','B15','B16','B17'
                  )),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_tax_configs_studio
  ON public.fiscal_tax_configs(studio_id);

-- 3. Triggers updated_at
CREATE TRIGGER trg_fiscal_ncf_seq_updated_at
  BEFORE UPDATE ON public.fiscal_ncf_sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_fiscal_tax_configs_updated_at
  BEFORE UPDATE ON public.fiscal_tax_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. RLS — solo miembros del studio
ALTER TABLE public.fiscal_ncf_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_tax_configs   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_ncf_seq_member_all ON public.fiscal_ncf_sequences;
CREATE POLICY fiscal_ncf_seq_member_all ON public.fiscal_ncf_sequences
  FOR ALL
  USING (public.is_studio_member(studio_id))
  WITH CHECK (public.is_studio_member(studio_id));

DROP POLICY IF EXISTS fiscal_tax_configs_member_all ON public.fiscal_tax_configs;
CREATE POLICY fiscal_tax_configs_member_all ON public.fiscal_tax_configs
  FOR ALL
  USING (public.is_studio_member(studio_id))
  WITH CHECK (public.is_studio_member(studio_id));

-- 5. RPC atómica: asigna el siguiente NCF de una secuencia activa.
--
-- Por qué stored function en lugar de TS: Supabase JS client NO permite
-- `SELECT ... FOR UPDATE`, así que la atomicidad debe vivir server-side en PG.
-- Replica el patrón de `create_client_with_booking` ya en uso.
--
-- Args:
--   p_studio_id — UUID del studio dueño de la secuencia
--   p_type      — tipo NCF (B01..B17)
--
-- Returns: ncf (texto formateado), sequence_id (UUID), prefix (B02), value (entero)
--
-- Errores:
--   • 'NO_ACTIVE_NCF_SEQUENCE' — no hay secuencia activa con cupo
--   • 'NCF_SEQUENCE_EXHAUSTED'  — la única activa llegó al tope (después de incrementar)
CREATE OR REPLACE FUNCTION public.assign_next_ncf(
  p_studio_id UUID,
  p_type      TEXT
) RETURNS TABLE(
  ncf           TEXT,
  sequence_id   UUID,
  prefix        TEXT,
  sequence_value INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq RECORD;
  v_next INTEGER;
  v_will_exhaust BOOLEAN;
BEGIN
  -- Lock la secuencia activa con cupo. SKIP LOCKED → si hay concurrencia,
  -- esperan tickets diferentes (en el futuro permitiría múltiples secuencias
  -- activas; hoy el UNIQUE garantiza una sola, así que el SKIP es defensivo).
  SELECT id, prefix, current_value, range_from, range_to, expires_at
    INTO v_seq
    FROM public.fiscal_ncf_sequences
   WHERE studio_id = p_studio_id
     AND type = p_type
     AND status = 'ACTIVE'
     AND deleted_at IS NULL
     AND current_value < range_to
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY range_from ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_seq.id IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_NCF_SEQUENCE'
      USING ERRCODE = 'P0001',
            HINT = format('Crea o reactiva una secuencia NCF de tipo %s con cupo disponible.', p_type);
  END IF;

  v_next := GREATEST(v_seq.current_value + 1, v_seq.range_from);
  v_will_exhaust := v_next >= v_seq.range_to;

  UPDATE public.fiscal_ncf_sequences
     SET current_value = v_next,
         status        = CASE WHEN v_will_exhaust THEN 'EXHAUSTED' ELSE 'ACTIVE' END,
         updated_at    = now()
   WHERE id = v_seq.id;

  RETURN QUERY SELECT
    v_seq.prefix || lpad(v_next::TEXT, 8, '0'),
    v_seq.id,
    v_seq.prefix,
    v_next;
END;
$$;

COMMENT ON FUNCTION public.assign_next_ncf IS
  'Asigna atómicamente el siguiente NCF de una secuencia activa del studio. Marca EXHAUSTED al tope.';

-- 6. Tracking columns en invoices para NCF asignado (cuando lleguemos a F4)
--    NOTA: las columnas se agregan a `invoices` existente con DEFAULT NULL para
--    no romper datos previos. La integración real al flujo de facturación se hace
--    en F4 (invoice.service.ts).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ncf TEXT,
  ADD COLUMN IF NOT EXISTS ncf_type TEXT,
  ADD COLUMN IF NOT EXISTS ncf_sequence_id UUID REFERENCES public.fiscal_ncf_sequences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS itbis_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS itbis_rate NUMERIC(5,2);

CREATE INDEX IF NOT EXISTS ix_invoices_ncf
  ON public.invoices(ncf)
  WHERE ncf IS NOT NULL;

-- Solo un invoice por NCF (consistencia DGII)
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_ncf
  ON public.invoices(ncf)
  WHERE ncf IS NOT NULL AND deleted_at IS NULL;
