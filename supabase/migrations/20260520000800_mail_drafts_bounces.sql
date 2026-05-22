-- ============================================================================
-- F6 V2 — Soporte para Drafts (borradores) + Bounce DSN webhook
-- ============================================================================
-- Extiende el módulo Mail con:
--   1. Status 'draft' en el enum mail_message_status (para outbound sin enviar)
--   2. Tabla mail_bounce_events para guardar Delivery Status Notifications (DSN)
--      cuando Mailcow nos avisa de un email rebotado
--
-- Requiere: 20260520000600_mail_init.sql aplicado.
-- ============================================================================

-- 1) Agregar 'draft' al enum
ALTER TYPE public.mail_message_status ADD VALUE IF NOT EXISTS 'draft';

-- 2) Tabla mail_bounce_events
CREATE TABLE IF NOT EXISTS public.mail_bounce_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id           UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  account_id          UUID REFERENCES public.mail_accounts(id) ON DELETE SET NULL,
  message_id          UUID REFERENCES public.mail_messages(id) ON DELETE SET NULL,
  -- Email del recipient que rebotó
  recipient_email     TEXT NOT NULL,
  -- Tipo de bounce: hard (permanente), soft (temporal), unknown
  bounce_type         TEXT NOT NULL CHECK (bounce_type IN ('hard','soft','unknown')),
  -- DSN status code de RFC 3464 (ej. "5.1.1" mailbox does not exist)
  dsn_status          TEXT,
  -- Diagnostic-Code header del DSN
  diagnostic_code     TEXT,
  -- Subject del email original que rebotó
  original_subject    TEXT,
  -- Raw DSN message para debugging
  raw_dsn             TEXT,
  -- Procesado: cuando el sistema actualiza el status del message
  processed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_mail_bounce_studio
  ON public.mail_bounce_events(studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_mail_bounce_message
  ON public.mail_bounce_events(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mail_bounce_recipient
  ON public.mail_bounce_events(recipient_email);

COMMENT ON TABLE public.mail_bounce_events IS
  'Almacena DSN (Delivery Status Notifications) cuando un correo outbound rebota.
   El webhook /api/webhooks/mailcow-bounce procesa el DSN y crea estos registros.
   Update opcional del mail_messages.status = bounced.';

-- 3) RLS
ALTER TABLE public.mail_bounce_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_bounce_events_studio_select ON public.mail_bounce_events;
CREATE POLICY mail_bounce_events_studio_select ON public.mail_bounce_events
  FOR SELECT TO authenticated
  USING (public.is_studio_member(studio_id));

DROP POLICY IF EXISTS mail_bounce_events_service_all ON public.mail_bounce_events;
CREATE POLICY mail_bounce_events_service_all ON public.mail_bounce_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4) Vista útil: bounces recientes con info del message original
CREATE OR REPLACE VIEW public.mail_bounce_recent AS
SELECT
  b.id,
  b.studio_id,
  b.recipient_email,
  b.bounce_type,
  b.dsn_status,
  b.diagnostic_code,
  b.original_subject,
  b.created_at,
  m.id as original_message_id,
  m.subject as message_subject,
  m.from_email as sender_email,
  m.sent_at
FROM public.mail_bounce_events b
LEFT JOIN public.mail_messages m ON m.id = b.message_id
WHERE b.created_at > NOW() - INTERVAL '30 days'
ORDER BY b.created_at DESC;

-- 5) Comentarios sobre 'draft' usage
COMMENT ON COLUMN public.mail_messages.status IS
  'Status workflow:
   - Inbound: received → read → archived
   - Outbound: draft → queued → sending → sent → delivered (o bounced/failed)
   - draft: outbound NO enviado todavia (folder_id apunta a folder kind=drafts)';
