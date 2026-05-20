-- ============================================================================
-- Internal Chat — Mensajes entre staff del studio
-- ============================================================================
-- Patrón:
--   - chat_channels: salas (general, #ventas, DM 1:1, vinculadas a proyecto)
--   - chat_channel_members: quién está en cada canal
--   - chat_messages: mensajes con replies + reactions
--   - chat_reactions: emoji reactions
--   - chat_typing: who-is-typing indicator (efímero)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE chat_channel_kind AS ENUM (
    'general',     -- todos los members del studio
    'group',       -- subset de members con nombre custom
    'dm',          -- 1:1
    'project'      -- vinculado a project_id
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- chat_channels
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  kind            chat_channel_kind NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  -- Vinculacion opcional a proyecto
  project_id      UUID,
  -- Estado
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Audit
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Stats cached
  last_message_at TIMESTAMPTZ,
  message_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_chat_channels_studio
  ON public.chat_channels(studio_id, kind)
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS ix_chat_channels_project
  ON public.chat_channels(project_id)
  WHERE project_id IS NOT NULL;

-- ============================================================================
-- chat_channel_members
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_channel_members (
  channel_id      UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  -- Estado
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Read state
  last_read_at    TIMESTAMPTZ,
  -- Preferencias
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_muted        BOOLEAN NOT NULL DEFAULT FALSE,

  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_chat_channel_members_user
  ON public.chat_channel_members(user_id);

-- ============================================================================
-- chat_messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  studio_id       UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  -- Autor
  author_id       UUID NOT NULL,
  -- Contenido
  content         TEXT,
  content_type    TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'system', 'file')),
  -- Reply / threading
  parent_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  -- Adjuntos (refs a Storage)
  attachments     JSONB,
  -- Mentions @user
  mentions        UUID[] DEFAULT ARRAY[]::UUID[],
  -- Edit history
  is_edited       BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at       TIMESTAMPTZ,
  -- Soft delete
  deleted_at      TIMESTAMPTZ,
  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_chat_messages_channel
  ON public.chat_messages(channel_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_chat_messages_parent
  ON public.chat_messages(parent_message_id)
  WHERE parent_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_chat_messages_mentions
  ON public.chat_messages USING GIN(mentions)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- chat_reactions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_reactions (
  message_id      UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  emoji           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS ix_chat_reactions_message
  ON public.chat_reactions(message_id);

-- ============================================================================
-- Triggers updated_at
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_chat_channels ON public.chat_channels';
    EXECUTE 'CREATE TRIGGER set_updated_at_chat_channels
             BEFORE UPDATE ON public.chat_channels
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';

    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at_chat_messages ON public.chat_messages';
    EXECUTE 'CREATE TRIGGER set_updated_at_chat_messages
             BEFORE UPDATE ON public.chat_messages
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- ============================================================================
-- Trigger: actualiza last_message_at + message_count del canal
-- ============================================================================
CREATE OR REPLACE FUNCTION chat_update_channel_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.chat_channels
  SET
    last_message_at = NEW.created_at,
    message_count = message_count + 1
  WHERE id = NEW.channel_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_message_insert_update_channel ON public.chat_messages;
CREATE TRIGGER chat_message_insert_update_channel
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION chat_update_channel_stats();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

-- channels: read si is_studio_member, write si admin/owner
DROP POLICY IF EXISTS chat_channels_studio_read ON public.chat_channels;
CREATE POLICY chat_channels_studio_read ON public.chat_channels
  FOR SELECT TO authenticated
  USING (public.is_studio_member(studio_id));

DROP POLICY IF EXISTS chat_channels_studio_write ON public.chat_channels;
CREATE POLICY chat_channels_studio_write ON public.chat_channels
  FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_member(studio_id));

DROP POLICY IF EXISTS chat_channels_studio_update ON public.chat_channels;
CREATE POLICY chat_channels_studio_update ON public.chat_channels
  FOR UPDATE TO authenticated
  USING (public.is_studio_member(studio_id))
  WITH CHECK (public.is_studio_member(studio_id));

-- members: lectura amplia (necesario para listar quién está en el canal), write
-- via service_role (manage_membership API)
DROP POLICY IF EXISTS chat_members_read ON public.chat_channel_members;
CREATE POLICY chat_members_read ON public.chat_channel_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = channel_id AND public.is_studio_member(c.studio_id)
    )
  );

-- messages: read/write si es miembro del canal
DROP POLICY IF EXISTS chat_messages_member_read ON public.chat_messages;
CREATE POLICY chat_messages_member_read ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = chat_messages.channel_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_messages_member_insert ON public.chat_messages;
CREATE POLICY chat_messages_member_insert ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = chat_messages.channel_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_messages_author_update ON public.chat_messages;
CREATE POLICY chat_messages_author_update ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- reactions
DROP POLICY IF EXISTS chat_reactions_member_all ON public.chat_reactions;
CREATE POLICY chat_reactions_member_all ON public.chat_reactions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_messages m
      JOIN public.chat_channel_members cm ON cm.channel_id = m.channel_id
      WHERE m.id = chat_reactions.message_id AND cm.user_id = auth.uid()
    )
  )
  WITH CHECK (user_id = auth.uid());

-- service_role bypass para todo
DROP POLICY IF EXISTS chat_channels_service ON public.chat_channels;
CREATE POLICY chat_channels_service ON public.chat_channels
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS chat_members_service ON public.chat_channel_members;
CREATE POLICY chat_members_service ON public.chat_channel_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS chat_messages_service ON public.chat_messages;
CREATE POLICY chat_messages_service ON public.chat_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS chat_reactions_service ON public.chat_reactions;
CREATE POLICY chat_reactions_service ON public.chat_reactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- RPC: crear canal general default
-- ============================================================================
CREATE OR REPLACE FUNCTION public.studio_seed_default_chat_channel(p_studio_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE studio_id = p_studio_id AND kind = 'general'
  LIMIT 1;

  IF v_channel_id IS NULL THEN
    INSERT INTO public.chat_channels (studio_id, kind, name, description)
    VALUES (p_studio_id, 'general', '#general', 'Canal general del studio')
    RETURNING id INTO v_channel_id;

    -- Auto-add a todos los members existentes
    INSERT INTO public.chat_channel_members (channel_id, user_id, role)
    SELECT v_channel_id, user_id, 'member'
    FROM public.studio_members
    WHERE studio_id = p_studio_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_channel_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.studio_seed_default_chat_channel(UUID) TO authenticated, service_role;
