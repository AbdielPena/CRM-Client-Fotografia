-- ============================================================================
-- Galerías 2.0 — Selección vs Entrega Final, templates premium, pistas, planes
-- Aditiva e idempotente. Las columnas nuevas heredan la RLS existente.
-- ============================================================================

-- ---------- galleries ----------
ALTER TABLE public.galleries
  ADD COLUMN IF NOT EXISTS gallery_type     text    NOT NULL DEFAULT 'selection',
  ADD COLUMN IF NOT EXISTS template_id      text    NOT NULL DEFAULT 'classic_proofing',
  ADD COLUMN IF NOT EXISTS theme            jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cover_config     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS subtitle         text,
  ADD COLUMN IF NOT EXISTS welcome_text     text,
  ADD COLUMN IF NOT EXISTS availability_days integer,
  ADD COLUMN IF NOT EXISTS package_id       uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS embed_enabled    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS embed_token      text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'galleries_gallery_type_check') THEN
    ALTER TABLE public.galleries
      ADD CONSTRAINT galleries_gallery_type_check
      CHECK (gallery_type IN ('selection','final_delivery'));
  END IF;
END $$;

-- Backfill defensivo (las filas previas ya toman el DEFAULT al agregar la columna)
UPDATE public.galleries SET gallery_type = 'selection' WHERE gallery_type IS NULL;

CREATE INDEX IF NOT EXISTS ix_galleries_type ON public.galleries(studio_id, gallery_type);
CREATE UNIQUE INDEX IF NOT EXISTS ux_galleries_embed_token
  ON public.galleries(embed_token) WHERE embed_token IS NOT NULL;

COMMENT ON COLUMN public.galleries.gallery_type IS 'selection = galería de selección; final_delivery = entrega final editada.';
COMMENT ON COLUMN public.galleries.theme IS 'Overrides visuales sobre el preset template_id (color, columnas, claro/oscuro, etc.).';
COMMENT ON COLUMN public.galleries.cover_config IS 'Portada por sección: imagen, foco, overlay, título, subtítulo, botón, estilo de texto.';
COMMENT ON COLUMN public.galleries.embed_token IS 'Token interno para consumir la galería por ID desde la web local (mismo servidor).';

-- ---------- gallery_assets: pistas de entrega ----------
ALTER TABLE public.gallery_assets
  ADD COLUMN IF NOT EXISTS delivery_track text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gallery_assets_delivery_track_check') THEN
    ALTER TABLE public.gallery_assets
      ADD CONSTRAINT gallery_assets_delivery_track_check
      CHECK (delivery_track IS NULL OR delivery_track IN ('social','high_quality'));
  END IF;
END $$;

COMMENT ON COLUMN public.gallery_assets.delivery_track IS
  'En entrega final: social = optimizada para redes; high_quality = original sin compresión. NULL = no clasificada.';

-- ---------- packages: configuración de galería por plan ----------
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS gallery_selection_enabled      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gallery_final_delivery_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gallery_downloads_allowed      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gallery_drive_backup_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gallery_availability_days      integer,
  ADD COLUMN IF NOT EXISTS gallery_default_template       text,
  ADD COLUMN IF NOT EXISTS gallery_max_photos             integer,
  ADD COLUMN IF NOT EXISTS gallery_drive_quality          text NOT NULL DEFAULT 'configurable';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packages_gallery_drive_quality_check') THEN
    ALTER TABLE public.packages
      ADD CONSTRAINT packages_gallery_drive_quality_check
      CHECK (gallery_drive_quality IN ('configurable','social','high_quality','both'));
  END IF;
END $$;

COMMENT ON COLUMN public.packages.gallery_availability_days IS 'Días de disponibilidad de galería heredados al crear; default global 30 si NULL.';
