-- ============================================================================
-- Marca de agua: configuración del estudio + tamaño y orientación
-- ============================================================================
-- Antes la marca de agua se configuraba galería por galería, sin tamaño ni
-- rotación, y nacía APAGADA — por eso ninguna galería de selección la tenía.
--
-- Ahora:
--   · El estudio define UNA configuración (Configuración → Marca de agua) que
--     es la que usan por defecto TODAS las galerías de selección.
--   · Cada galería puede desmarcar "usar la del estudio" y ajustar la suya.
--   · Las galerías de ENTREGA nunca llevan marca (las fotos son del cliente);
--     eso se fuerza en código, no depende de estas banderas.
--
-- Nada aquí toca tokens, enlaces ni vínculos de galerías.
-- ============================================================================

-- Tamaño (% del ancho de la foto), rotación (grados) y margen (% del ancho).
ALTER TABLE public.galleries
  ADD COLUMN IF NOT EXISTS watermark_scale int NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS watermark_rotation int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watermark_margin int NOT NULL DEFAULT 4,
  -- Sube en cada aplicación: se usa para que el navegador no muestre la foto
  -- vieja en caché (las fotos conservan la MISMA dirección, así que sin esto
  -- el cliente seguiría viendo la versión sin marca).
  ADD COLUMN IF NOT EXISTS watermark_version int NOT NULL DEFAULT 0,
  -- true = hereda del estudio. Las galerías que ya tenían config propia se
  -- pasan a false más abajo para no perderla.
  ADD COLUMN IF NOT EXISTS watermark_use_studio_default boolean NOT NULL DEFAULT true;

ALTER TABLE public.galleries
  ADD CONSTRAINT galleries_watermark_scale_chk
    CHECK (watermark_scale BETWEEN 3 AND 100) NOT VALID;
ALTER TABLE public.galleries
  ADD CONSTRAINT galleries_watermark_rotation_chk
    CHECK (watermark_rotation BETWEEN -180 AND 180) NOT VALID;
ALTER TABLE public.galleries
  ADD CONSTRAINT galleries_watermark_margin_chk
    CHECK (watermark_margin BETWEEN 0 AND 45) NOT VALID;

-- Configuración del estudio (una sola fila por estudio, en su branding).
ALTER TABLE public.studio_branding
  ADD COLUMN IF NOT EXISTS watermark_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.studio_branding.watermark_defaults IS
  'Marca de agua por defecto de las galerías de selección: {enabled, mode, text, imageKey, position, opacity, scale, rotation, margin}';

-- Las galerías que YA tenían marca de agua propia conservan su ajuste.
UPDATE public.galleries
   SET watermark_use_studio_default = false
 WHERE watermark_enabled = true;
