-- ============================================================================
-- API Tokens + Outbound Webhooks — integraciones con terceros
-- ============================================================================
-- Permite:
--   1. api_tokens: que un studio cree tokens Bearer para llamar la API
--   2. outbound_webhooks: que un studio registre URLs que reciban eventos
--      (HMAC firmados con secret per-webhook)
--   3. outbound_webhook_deliveries: log de entregas con retries
-- ============================================================================

-- ============================================================================
-- 1. API tokens
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE api_token_scope AS ENUM (
    'read',
    'write',
    'admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.api_tokens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id           UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  -- Identificador legible (usuario lo nombra)
  name                TEXT NOT NULL,
  -- Token hash (sha256). El plaintext solo se muestra UNA vez al crear.
  token_hash          TEXT NOT NULL UNIQUE,
  -- Prefix visible para identificar (ej "sf_abc12...") sin revelar el full
  token_prefix        TEXT NOT NULL,
  -- Scopes
  scopes              api_token_scope[] NOT NULL DEFAULT ARRAY['read']::api_token_scope[],
  -- Expira (NULL = nunca)
  expires_at          TIMESTAMPTZ,
  -- Tracking
  last_used_at        TIMESTAMPTZ,
  usage_count         INTEGER NOT NULL DEFAULT 0,
  -- Estado
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Audit
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at          TIMESTAMPTZ,
  revoked_reason      TEXT
);

CREATE INDEX IF NOT EXISTS ix_api_tokens_studio
  ON public.api_tokens(studio_id)
  WHERE is_active = TRUE AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_api_tokens_prefix
  ON public.api_tokens(token_prefix);

COMMENT ON TABLE public.api_tokens IS
  'API tokens Bearer per-studio. token_hash es sha256 del plaintext.
   El plaintext SOLO se muestra una vez al crear. Después solo se ve el prefix.';

-- ============================================================================
-- 2. Outbound webhooks
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE webhook_event_type AS ENUM (
    -- CRM
    'client.created',
    'client.updated',
    'client.deleted',
    'lead.created',
    'project.created',
    'project.status_changed',
    'project.completed',
    -- Invoices
    'invoice.created',
    'invoice.sent',
    'invoice.paid',
    'invoice.cancelled',
    'payment.received',
    -- Bookings
    'booking.received',
    'booking.confirmed',
    -- Galleries
    'gallery.created',
    'gallery.published',
    'gallery.viewed',
    -- Tasks
    'task.created',
    'task.completed',
    -- Custom
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.outbound_webhooks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id           UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,

  -- Config
  name                TEXT NOT NULL,
  url                 TEXT NOT NULL,
  -- Eventos que escuchamos (array)
  events              webhook_event_type[] NOT NULL DEFAULT ARRAY[]::webhook_event_type[],
  -- Secret para HMAC SHA-256 signature (header X-StudioFlow-Signature)
  secret              TEXT NOT NULL,
  -- Headers custom adicionales
  custom_headers      JSONB,

  -- Estado
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Stats
  last_delivered_at   TIMESTAMPTZ,
  last_status_code    INTEGER,
  last_error          TEXT,
  total_deliveries    INTEGER NOT NULL DEFAULT 0,
  total_failures      INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  -- Auto-disable después de N failures consecutivos
  auto_disable_threshold INTEGER NOT NULL DEFAULT 10,

  -- Audit
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_outbound_webhooks_studio_events
  ON public.outbound_webhooks USING GIN (events)
  WHERE is_active = TRUE AND deleted_at IS NULL;

COMMENT ON TABLE public.outbound_webhooks IS
  'Webhooks salientes per-studio. Cuando ocurre un evento configurado,
   el dispatcher POST al URL con el payload + signature HMAC.';

-- ============================================================================
-- 3. Outbound webhook deliveries (log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.outbound_webhook_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id           UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  webhook_id          UUID NOT NULL REFERENCES public.outbound_webhooks(id) ON DELETE CASCADE,

  -- Event info
  event_type          webhook_event_type NOT NULL,
  event_payload       JSONB NOT NULL,

  -- HTTP details
  request_method      TEXT NOT NULL DEFAULT 'POST',
  request_url         TEXT NOT NULL,
  request_headers     JSONB,
  request_body        TEXT,

  -- Response
  response_status     INTEGER,
  response_headers    JSONB,
  response_body       TEXT,
  response_time_ms    INTEGER,

  -- Status
  success             BOOLEAN NOT NULL DEFAULT FALSE,
  error_message       TEXT,

  -- Retries
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  next_retry_at       TIMESTAMPTZ,

  -- Audit
  attempted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_webhook_deliveries_webhook
  ON public.outbound_webhook_deliveries(webhook_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS ix_webhook_deliveries_retry
  ON public.outbound_webhook_deliveries(next_retry_at)
  WHERE next_retry_at IS NOT NULL AND success = FALSE;

COMMENT ON TABLE public.outbound_webhook_deliveries IS
  'Log de cada entrega de webhook. Retries con next_retry_at para el cron.
   30 días retention recomendado (limpieza via cron).';

-- ============================================================================
-- 4. Updated_at triggers
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_api_tokens ON public.api_tokens';
    EXECUTE 'CREATE TRIGGER set_updated_at_api_tokens
             BEFORE UPDATE ON public.api_tokens
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';

    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_outbound_webhooks ON public.outbound_webhooks';
    EXECUTE 'CREATE TRIGGER set_updated_at_outbound_webhooks
             BEFORE UPDATE ON public.outbound_webhooks
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- ============================================================================
-- 5. RLS
-- ============================================================================
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- api_tokens: members del studio leen/crean (excepto el token_hash plaintext)
DROP POLICY IF EXISTS api_tokens_studio_all ON public.api_tokens;
CREATE POLICY api_tokens_studio_all ON public.api_tokens
  FOR ALL TO authenticated
  USING (public.is_studio_member(studio_id))
  WITH CHECK (public.is_studio_member(studio_id));

-- outbound_webhooks: full access para members
DROP POLICY IF EXISTS outbound_webhooks_studio_all ON public.outbound_webhooks;
CREATE POLICY outbound_webhooks_studio_all ON public.outbound_webhooks
  FOR ALL TO authenticated
  USING (public.is_studio_member(studio_id))
  WITH CHECK (public.is_studio_member(studio_id));

-- webhook_deliveries: read-only para members (lo escribe el dispatcher service_role)
DROP POLICY IF EXISTS webhook_deliveries_studio_read ON public.outbound_webhook_deliveries;
CREATE POLICY webhook_deliveries_studio_read ON public.outbound_webhook_deliveries
  FOR SELECT TO authenticated
  USING (public.is_studio_member(studio_id));

-- service_role bypass
DROP POLICY IF EXISTS api_tokens_service_all ON public.api_tokens;
CREATE POLICY api_tokens_service_all ON public.api_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS outbound_webhooks_service_all ON public.outbound_webhooks;
CREATE POLICY outbound_webhooks_service_all ON public.outbound_webhooks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS webhook_deliveries_service_all ON public.outbound_webhook_deliveries;
CREATE POLICY webhook_deliveries_service_all ON public.outbound_webhook_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);
