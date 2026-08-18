-- ============================================================================
-- La ganancia se guarda EN LA SESIÓN, no solo en el plan
-- ============================================================================
-- Hasta ahora la ganancia de una sesión se leía del plan en el momento de
-- mirarla. Eso rompe por los dos lados:
--
--   · Se sube el precio del plan → las sesiones viejas empiezan a reportar la
--     ganancia nueva (o, si se recalculaba, una inventada).
--   · Se le hace un DESCUENTO a una clienta → la sesión sigue reportando la
--     ganancia completa del plan. A MAYCOL se le cobró 12,000 de una sesión de
--     24,000 y el sistema seguía contando los 20,000 de ganancia del plan.
--
-- Sin distinguir "precio viejo" de "descuento" ninguna fórmula acierta en los
-- dos casos. La solución es dejar de adivinar: cada sesión guarda SU ganancia,
-- copiada del plan al crearla o al cambiarle el plan, y editable a mano cuando
-- hay un descuento.
-- ============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS profit_amount numeric(12, 2);

COMMENT ON COLUMN public.projects.profit_amount IS
  'Ganancia limpia de ESTA sesión. Se copia del plan al asignarlo y se puede '
  'ajustar a mano (descuentos). NULL = usar la del plan.';

-- ── El copiado, en la base de datos ─────────────────────────────────────────
-- Va en un trigger y no en el código porque las sesiones se crean desde media
-- docena de sitios (reserva aceptada, cotización, alta manual, cliente nuevo…)
-- y alguno es SQL. Un solo lugar, imposible de olvidar.
CREATE OR REPLACE FUNCTION public.snapshot_project_profit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.profit_amount IS NULL AND NEW.package_id IS NOT NULL THEN
      SELECT p.profit_amount INTO NEW.profit_amount
        FROM public.packages p WHERE p.id = NEW.package_id;
    END IF;
  ELSIF NEW.package_id IS DISTINCT FROM OLD.package_id THEN
    -- Cambió el plan. Si en la misma operación se fijó la ganancia a mano, esa
    -- manda; si no, se copia la del plan nuevo.
    IF NEW.profit_amount IS NOT DISTINCT FROM OLD.profit_amount THEN
      SELECT p.profit_amount INTO NEW.profit_amount
        FROM public.packages p WHERE p.id = NEW.package_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_project_profit ON public.projects;
CREATE TRIGGER trg_snapshot_project_profit
  BEFORE INSERT OR UPDATE OF package_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_project_profit();

-- ── Las que ya existen ──────────────────────────────────────────────────────
-- Se copia la ganancia declarada en su plan. Los descuentos hay que ajustarlos
-- a mano: la base no sabe cuáles fueron descuento y cuáles precio viejo.
UPDATE public.projects p
   SET profit_amount = pk.profit_amount
  FROM public.packages pk
 WHERE pk.id = p.package_id
   AND p.profit_amount IS NULL
   AND pk.profit_amount IS NOT NULL;
