-- ============================================================================
-- Mail — schema completo (integración Mailcow IMAP + SMTP)
--
-- Tablas con prefijo `mail_`. Multi-tenant: studio_id NOT NULL.
-- RLS via public.is_studio_member(studio_id).
--
-- Estrategia de sync:
--   - 1 row en mail_accounts por (studio_id, email) con creds IMAP cifradas
--   - mail_imap_sync job (cron c/5min) llama lib/mailcow.ts → trae nuevos
--     mensajes vía IMAP IDLE o UID-FETCH desde last_uid_synced
--   - Threads se agrupan por Message-ID / In-Reply-To / References header
--   - Attachments se descargan + suben a Supabase Storage (bucket 'mail-attachments')
--   - mail_messages.body_html y body_text se almacenan inline (con cap 1MB)
--     porque buscar/snippet preview requiere fulltext PG search
--
-- Outbound (SMTP):
--   - mail_messages.direction='outbound' + status workflow QUEUED→SENT
--   - lib/mailcow.ts.sendEmail() envía via Mailcow SMTP server
--   - Reuses nodemailer (ya en deps del repo) para outbound
--
-- Tablas:
--   • mail_accounts — cuentas Mailcow del studio con creds cifradas
--   • mail_folders — INBOX, Sent, Drafts, Trash, custom
--   • mail_threads — agrupación por Message-ID chain
--   • mail_messages — emails individuales (inbound/outbound)
--   • mail_attachments — archivos adjuntos (Storage refs)
--   • mail_labels — Gmail-style labels (opcionales)
--   • mail_message_labels — assoc M-N entre messages y labels
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- ENUMS
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE mail_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mail_message_status AS ENUM (
    'queued',       -- outbound pendiente de envío
    'sending',      -- outbound en proceso
    'sent',         -- outbound enviado exitosamente
    'delivered',    -- outbound entregado (DSN/MDN)
    'bounced',      -- outbound rebotó
    'failed',       -- outbound falló (errors permanentes)
    'received',     -- inbound recibido
    'read',         -- inbound leído por el user
    'archived'      -- archivado
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mail_folder_kind AS ENUM (
    'inbox','sent','drafts','trash','spam','archive','custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mail_sync_status AS ENUM (
    'ok','syncing','error','disabled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- mail_accounts — cuentas Mailcow del studio
--
-- Cada studio puede tener N cuentas (ej: info@studio.com, billing@studio.com).
-- Las credenciales IMAP/SMTP se cifran con pgsodium o secret externo —
-- aquí guardamos solo el ref al secret (no la password en claro).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mail_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  email           CITEXT NOT NULL,
  display_name    TEXT,
  -- IMAP config
  imap_host       TEXT NOT NULL,
  imap_port       INTEGER NOT NULL DEFAULT 993,
  imap_secure     BOOLEAN NOT NULL DEFAULT TRUE,         -- TLS
  imap_username   TEXT NOT NULL,
  -- Password ref. En MVP: encrypted string usando Supabase Vault (vault.create_secret)
  -- o env var ref. En production: pgsodium.encrypt_aead con key del studio.
  imap_password_secret_id  TEXT NOT NULL,
  -- SMTP config (puede ser distinto host que IMAP)
  smtp_host       TEXT NOT NULL,
  smtp_port       INTEGER NOT NULL DEFAULT 587,
  smtp_secure     BOOLEAN NOT NULL DEFAULT TRUE,         -- STARTTLS
  smtp_username   TEXT NOT NULL,
  smtp_password_secret_id  TEXT NOT NULL,
  -- Sync state
  sync_status     mail_sync_status NOT NULL DEFAULT 'ok',
  last_synced_at  TIMESTAMPTZ,
  last_uid_synced BIGINT,                                -- UID IMAP del último mensaje
  last_error      TEXT,
  -- Toggles
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,        -- usada para outbound del studio
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (studio_id, email)
);
CREATE INDEX IF NOT EXISTS ix_mail_accounts_studio ON public.mail_accounts(studio_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_mail_accounts_sync ON public.mail_accounts(sync_status, last_synced_at) WHERE deleted_at IS NULL AND is_active = TRUE;
-- Solo UNA cuenta default por studio
CREATE UNIQUE INDEX IF NOT EXISTS ux_mail_accounts_one_default
  ON public.mail_accounts(studio_id) WHERE is_default = TRUE AND deleted_at IS NULL;

-- ============================================================================
-- mail_folders — INBOX, Sent, Drafts, etc.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mail_folders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES public.mail_accounts(id) ON DELETE CASCADE,
  kind            mail_folder_kind NOT NULL,
  name            TEXT NOT NULL,                         -- "INBOX", "Sent", custom name
  parent_folder_id UUID REFERENCES public.mail_folders(id) ON DELETE CASCADE,
  unread_count    INTEGER NOT NULL DEFAULT 0,
  message_count   INTEGER NOT NULL DEFAULT 0,
  imap_path       TEXT NOT NULL,                         -- path IMAP exacto ("INBOX.Sent")
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, imap_path)
);
CREATE INDEX IF NOT EXISTS ix_mail_folders_account ON public.mail_folders(account_id, kind);

-- ============================================================================
-- mail_threads — agrupación por Message-ID chain
--
-- Threading basado en RFC 5322:
--   - In-Reply-To / References headers determinan thread parent
--   - Si no hay headers, fallback a normalized subject + participants window
--
-- Diseño: 1 row por thread. mail_messages.thread_id apunta acá.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mail_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES public.mail_accounts(id) ON DELETE CASCADE,
  subject         TEXT,                                  -- snapshot del subject del primer mensaje
  participants    JSONB,                                 -- array [{email, name}] de participantes únicos
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count   INTEGER NOT NULL DEFAULT 0,
  unread_count    INTEGER NOT NULL DEFAULT 0,
  has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  -- Asociación cross-módulo opcional
  client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  invoice_id      UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_mail_threads_studio_last
  ON public.mail_threads(studio_id, last_message_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_mail_threads_account
  ON public.mail_threads(account_id, last_message_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_mail_threads_client
  ON public.mail_threads(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mail_threads_project
  ON public.mail_threads(project_id) WHERE project_id IS NOT NULL;

-- ============================================================================
-- mail_messages — emails individuales
--
-- Inbound: viene de IMAP sync. message_id es el `Message-ID:` header.
-- Outbound: creado por la app al enviar email. message_id se genera local
--           y se envía como `Message-ID:` para tracking de delivery.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mail_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id         UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES public.mail_accounts(id) ON DELETE CASCADE,
  thread_id         UUID REFERENCES public.mail_threads(id) ON DELETE SET NULL,
  folder_id         UUID REFERENCES public.mail_folders(id) ON DELETE SET NULL,
  direction         mail_direction NOT NULL,
  status            mail_message_status NOT NULL,
  -- Identifiers (RFC 5322)
  message_id        TEXT,                                -- header "Message-ID:" RFC unique
  in_reply_to       TEXT,                                -- header "In-Reply-To:"
  references_chain  TEXT[],                              -- header "References:" parseado
  imap_uid          BIGINT,                              -- UID IMAP del server (para sync)
  -- Headers comunes
  subject           TEXT,
  from_email        CITEXT NOT NULL,
  from_name         TEXT,
  to_recipients     JSONB NOT NULL,                      -- [{email, name}]
  cc_recipients     JSONB,
  bcc_recipients    JSONB,
  reply_to          CITEXT,
  -- Cuerpo
  body_text         TEXT,                                -- text/plain
  body_html         TEXT,                                -- text/html (sanitizado en client)
  snippet           TEXT,                                -- primeras ~140 chars para preview lista
  -- Atributos
  has_attachments   BOOLEAN NOT NULL DEFAULT FALSE,
  size_bytes        INTEGER,
  -- Timestamps
  sent_at           TIMESTAMPTZ,                         -- header "Date:" del email
  received_at       TIMESTAMPTZ,                         -- cuando llegó al IMAP server
  read_at           TIMESTAMPTZ,
  -- Estado outbound (queued/sending workflow)
  scheduled_at      TIMESTAMPTZ,                         -- para outbound delayed
  sent_via_pi_id    TEXT,                                -- payment intent o referencia outbound
  delivery_error    TEXT,                                -- si bounced/failed
  -- Asociación cross-módulo (auto-set en outbound, manual en inbound)
  client_id         UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  invoice_id        UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  -- Raw para debugging / re-parsing
  raw_headers       JSONB,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_mail_messages_studio_received
  ON public.mail_messages(studio_id, received_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_mail_messages_thread
  ON public.mail_messages(thread_id, sent_at);
CREATE INDEX IF NOT EXISTS ix_mail_messages_folder_status
  ON public.mail_messages(folder_id, status);
CREATE INDEX IF NOT EXISTS ix_mail_messages_from
  ON public.mail_messages(from_email) WHERE deleted_at IS NULL;
-- Dedupe por message_id dentro de la cuenta (IMAP retries no deben duplicar)
CREATE UNIQUE INDEX IF NOT EXISTS ux_mail_messages_account_msgid
  ON public.mail_messages(account_id, message_id) WHERE message_id IS NOT NULL;
-- UID único por account (para sync con UID-FETCH)
CREATE UNIQUE INDEX IF NOT EXISTS ux_mail_messages_account_uid
  ON public.mail_messages(account_id, folder_id, imap_uid)
  WHERE imap_uid IS NOT NULL AND direction = 'inbound';
-- FTS index para búsqueda
CREATE INDEX IF NOT EXISTS ix_mail_messages_search
  ON public.mail_messages USING gin (
    to_tsvector('simple',
      coalesce(subject, '') || ' ' ||
      coalesce(snippet, '') || ' ' ||
      coalesce(from_email::text, '') || ' ' ||
      coalesce(from_name, '')
    )
  )
  WHERE deleted_at IS NULL;

-- ============================================================================
-- mail_attachments — adjuntos (refs a Supabase Storage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mail_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  message_id      UUID NOT NULL REFERENCES public.mail_messages(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  content_type    TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  -- Storage key en Supabase Storage (bucket 'mail-attachments')
  storage_key     TEXT NOT NULL,
  storage_bucket  TEXT NOT NULL DEFAULT 'mail-attachments',
  -- Para inline images en HTML
  is_inline       BOOLEAN NOT NULL DEFAULT FALSE,
  content_id      TEXT,                                  -- cid: ref para inline
  -- IMAP source info
  imap_part_id    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_mail_attachments_message
  ON public.mail_attachments(message_id);

-- ============================================================================
-- mail_labels — Gmail-style labels (opcional)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mail_labels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (studio_id, name)
);

CREATE TABLE IF NOT EXISTS public.mail_message_labels (
  message_id      UUID NOT NULL REFERENCES public.mail_messages(id) ON DELETE CASCADE,
  label_id        UUID NOT NULL REFERENCES public.mail_labels(id) ON DELETE CASCADE,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, label_id)
);
CREATE INDEX IF NOT EXISTS ix_mail_msg_labels_label ON public.mail_message_labels(label_id);

-- ============================================================================
-- TRIGGERS updated_at
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mail_accounts','mail_folders','mail_threads','mail_messages','mail_labels'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- RLS — habilitar + policy member_all en TODAS las tablas mail_*
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mail_accounts','mail_folders','mail_threads','mail_messages',
    'mail_attachments','mail_labels','mail_message_labels'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_member_all ON public.%I;', t, t);

    -- mail_message_labels no tiene studio_id directo — se infiere via JOIN al message
    IF t = 'mail_message_labels' THEN
      EXECUTE format(
        $rls$CREATE POLICY %I_member_all ON public.%I FOR ALL
          USING (EXISTS (
            SELECT 1 FROM public.mail_messages m
            WHERE m.id = mail_message_labels.message_id
              AND public.is_studio_member(m.studio_id)
          ))
          WITH CHECK (EXISTS (
            SELECT 1 FROM public.mail_messages m
            WHERE m.id = mail_message_labels.message_id
              AND public.is_studio_member(m.studio_id)
          ));$rls$,
        t, t
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I_member_all ON public.%I FOR ALL USING (public.is_studio_member(studio_id)) WITH CHECK (public.is_studio_member(studio_id));',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- RPC mail_recompute_thread_counters
--
-- Helper para mantener mail_threads.message_count/unread_count consistentes.
-- Se llama cuando se inserta/borra un mail_message para refrescar el thread.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mail_recompute_thread_counters(
  p_thread_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_unread INTEGER;
  v_last_at TIMESTAMPTZ;
  v_has_att BOOLEAN;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE direction = 'inbound' AND read_at IS NULL),
    MAX(COALESCE(sent_at, received_at, created_at)),
    BOOL_OR(has_attachments)
  INTO v_count, v_unread, v_last_at, v_has_att
  FROM public.mail_messages
  WHERE thread_id = p_thread_id
    AND deleted_at IS NULL;

  UPDATE public.mail_threads
     SET message_count   = COALESCE(v_count, 0),
         unread_count    = COALESCE(v_unread, 0),
         last_message_at = COALESCE(v_last_at, NOW()),
         has_attachments = COALESCE(v_has_att, FALSE),
         updated_at      = NOW()
   WHERE id = p_thread_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mail_recompute_thread_counters(UUID) TO authenticated;

COMMENT ON TABLE public.mail_accounts IS
  'Cuentas Mailcow del studio. Passwords NO almacenados en claro — solo refs a secrets (Supabase Vault o env).';
COMMENT ON TABLE public.mail_messages IS
  'Emails individuales (inbound desde IMAP, outbound vía SMTP). UNIQUE (account_id, message_id) garantiza dedup en sync retries.';
