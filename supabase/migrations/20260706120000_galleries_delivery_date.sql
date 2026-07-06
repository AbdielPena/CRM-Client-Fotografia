-- Fecha de entrega a nivel GALERÍA (para galerías sin proyecto/cliente, que no
-- pasan por client_deliveries). Simétrica a expires_at. Alimenta la lista de
-- "Próximas entregas" junto con las entregas de proyectos.
ALTER TABLE public.galleries
  ADD COLUMN IF NOT EXISTS delivery_date date;

COMMENT ON COLUMN public.galleries.delivery_date IS
  'Fecha de entrega manual (galerías sin proyecto). Las galerías con proyecto usan client_deliveries.estimated_delivery_date.';
