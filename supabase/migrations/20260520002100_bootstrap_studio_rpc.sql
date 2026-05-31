-- ============================================================================
-- RPC bootstrap_studio_for_current_user — onboarding de nuevo studio
-- ============================================================================
-- Llamada por:
--   - app/(auth)/setup/actions.ts    (bootstrapStudioAction)
--   - app/(auth)/actions.ts          (signUpAction)
-- Ambos invocan con SOLO 2 args nombrados: { p_studio_name, p_owner_name }.
--
-- BUG HISTÓRICO: existía en prod una versión vieja de 6 args
-- (p_studio_name, p_slug, p_owner_name, p_timezone, p_currency, p_event_type)
-- que NUNCA estuvo en las migrations del repo. PostgREST no podía matchear la
-- llamada de 2 args nombrados a esa función → el onboarding fallaba siempre con
-- "No pudimos crear tu studio" y /setup quedaba inútil. Un usuario que se
-- registraba (en el hub o directo) jamás obtenía un studio → loop /login.
--
-- Esta migration:
--   1. Elimina la versión vieja de 6 args (código muerto que rompía el match).
--   2. Crea la versión canónica de 2 args que matchea ambos call sites.
--
-- SECURITY DEFINER: durante la creación el user todavía NO es miembro de ningún
-- studio, así que las RLS policies de studios/studio_members lo bloquearían.
-- La función corre con privilegios elevados pero usa auth.uid() (JWT del
-- request) para garantizar que solo crea para el usuario autenticado.
-- ============================================================================

DROP FUNCTION IF EXISTS public.bootstrap_studio_for_current_user(
  text, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.bootstrap_studio_for_current_user(
  p_studio_name TEXT,
  p_owner_name TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_studio_id UUID;
  v_base_slug TEXT;
  v_slug      TEXT;
  v_suffix    INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotente: si ya tiene studio activo, devolver ese (retry / carrera)
  SELECT studio_id INTO v_studio_id
  FROM public.studio_members
  WHERE user_id = v_user_id AND is_active = TRUE
  LIMIT 1;
  IF v_studio_id IS NOT NULL THEN
    RETURN v_studio_id;
  END IF;

  -- Slug base (lowercase, alfanumérico + guiones)
  v_base_slug := regexp_replace(lower(trim(p_studio_name)), '[^a-z0-9]+', '-', 'g');
  v_base_slug := trim(BOTH '-' FROM v_base_slug);
  IF v_base_slug = '' THEN v_base_slug := 'studio'; END IF;
  v_slug := v_base_slug;

  -- Resolver colisiones de slug
  WHILE EXISTS (SELECT 1 FROM public.studios WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  END LOOP;

  -- Crear el studio (resto de columnas con defaults: plan=free, currency=DOP, etc.)
  INSERT INTO public.studios (name, slug)
  VALUES (trim(p_studio_name), v_slug)
  RETURNING id INTO v_studio_id;

  -- Membership owner
  INSERT INTO public.studio_members (studio_id, user_id, role, is_active, display_name, joined_at)
  VALUES (v_studio_id, v_user_id, 'owner', TRUE, NULLIF(trim(p_owner_name), ''), now());

  -- Seed onboarding checklist si la función existe (no fatal si falta)
  BEGIN
    PERFORM public.studio_seed_onboarding(v_studio_id);
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  RETURN v_studio_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_studio_for_current_user(TEXT, TEXT) TO authenticated;
