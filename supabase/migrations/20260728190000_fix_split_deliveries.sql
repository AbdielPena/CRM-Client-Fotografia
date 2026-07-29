-- ============================================================================
-- Galerías de entrega ya entregadas que el sistema no reconocía
-- ============================================================================
-- Cuando se separó "selección" de "entrega final" (split_unified_gallery), las
-- galerías de entrega nacieron con sus fotos pero SIN `delivery_ready_at`, que
-- es la marca que usa todo el sistema para saber que la entrega ya salió.
--
-- Consecuencia: entregas ya hechas seguían contando como pendientes, la sesión
-- no pasaba a "Entregado" y la tarjeta no decía "Entrega enviada".
--
-- Se marcan como entregadas SOLO las que tienen fotos (las vacías siguen
-- pendientes, que es lo correcto). La fecha usada es la de la última foto
-- cargada: es cuando realmente se armó la entrega.
-- ============================================================================

WITH candidatas AS (
  SELECT g.id,
         COALESCE(
           (SELECT MAX(a.created_at) FROM public.gallery_assets a
             WHERE a.gallery_id = g.id AND a.deleted_at IS NULL),
           g.updated_at
         ) AS fecha
  FROM public.galleries g
  WHERE g.deleted_at IS NULL
    AND g.gallery_type = 'final_delivery'
    AND g.delivery_ready_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.gallery_assets a
      WHERE a.gallery_id = g.id AND a.deleted_at IS NULL
    )
)
UPDATE public.galleries g
SET delivery_ready_at = c.fecha,
    updated_at = now()
FROM candidatas c
WHERE g.id = c.id;

-- ── Recalcular las entregas afectadas ───────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id, studio_id FROM public.projects
    WHERE deleted_at IS NULL AND finalized_at IS NULL
  LOOP
    PERFORM public.upsert_project_delivery(r.studio_id, r.id);
  END LOOP;
END $$;
