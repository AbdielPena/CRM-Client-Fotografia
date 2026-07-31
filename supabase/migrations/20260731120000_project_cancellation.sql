-- ============================================================================
-- Cancelar una sesión SIN perder al cliente
-- ============================================================================
-- Hasta ahora "cancelar" era arrastrar la tarjeta a la columna Cancelado: solo
-- cambiaba la etiqueta. La factura seguía viva, la fecha seguía ocupada, el
-- reloj de entrega seguía corriendo y la sesión seguía apareciendo en todas
-- las listas.
--
-- Regla de oro: cancelar una sesión NUNCA toca la ficha del cliente. El cliente
-- se queda activo para que le sigan llegando los correos de fidelidad
-- (cumpleaños, inactividad, campañas). Mandarlo a la papelera sí lo sacaría de
-- todo — por eso son dos cosas distintas y separadas.
-- ============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  -- Qué se hizo con el dinero ya cobrado: 'kept' (me lo quedo, reserva no
  -- reembolsable), 'refunded' (se devuelve) o 'none' (no había pagos).
  ADD COLUMN IF NOT EXISTS cancellation_deposit text;

COMMENT ON COLUMN public.projects.cancelled_at IS
  'Fecha de cancelación de la sesión. La ficha del cliente NO se toca: sigue '
  'activa para recibir los correos de fidelidad.';
COMMENT ON COLUMN public.projects.cancellation_deposit IS
  'kept | refunded | none — qué se hizo con lo ya cobrado al cancelar.';

-- Buscar cancelaciones rápido (apartado "Canceladas").
CREATE INDEX IF NOT EXISTS projects_cancelled_at_idx
  ON public.projects (studio_id, cancelled_at)
  WHERE cancelled_at IS NOT NULL;

-- El estado "Cancelado" tiene que existir en el tablero de cada estudio.
INSERT INTO public.project_statuses (studio_id, label, color, position, is_default)
SELECT s.id, 'Cancelado', '#dc2626',
       COALESCE((SELECT MAX(position) + 1 FROM public.project_statuses x
                  WHERE x.studio_id = s.id), 0),
       false
FROM public.studios s
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_statuses p
  WHERE p.studio_id = s.id AND lower(p.label) = 'cancelado'
);
