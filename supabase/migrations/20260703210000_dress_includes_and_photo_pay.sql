-- Vestido por sesión: (a) el costo se resta de la ganancia SOLO si el plan
-- incluye el vestido (planes de quinceañera Luxury), (b) foto del vestido,
-- (c) estado de pago del gasto en FinanzApp.
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS includes_dress boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dress_image_url text;
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dress_pay_status text NOT NULL DEFAULT 'pending';

-- Marcar los planes de la categoría "Quinceañera Luxury" como que incluyen el
-- vestido (el estudio ajusta con el checkbox del editor de paquetes).
UPDATE public.packages SET includes_dress = true
 WHERE service_category_id = 'f4cfdfa8-0805-4b20-8f8f-6a0dfd47e443'
   AND deleted_at IS NULL;
