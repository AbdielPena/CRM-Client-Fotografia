-- Monto de vestido INCLUIDO por plan y por categoría (la categoría es el default,
-- el plan lo sobrescribe). Si el vestido cuesta más, el excedente se factura como
-- "costo extra de vestido". `dress_extra_cost` = excedente calculado;
-- `dress_extra_invoiced` = si ya se agregó a una factura (evita duplicar).
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS dress_included_amount numeric(12,2);
ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS dress_included_amount numeric(12,2);
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dress_extra_cost numeric(12,2);
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dress_extra_invoiced boolean NOT NULL DEFAULT false;
-- Estado de pago del vestido a la tienda (pending | paid). Deuda del estudio.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dress_pay_status text NOT NULL DEFAULT 'pending';

-- Backfill: los planes Luxury de quinceañera (includes_dress) y la categoría
-- "Quinceañera Luxury" arrancan con RD$17,000 incluido (ajustable por el dueño).
UPDATE public.packages SET dress_included_amount = 17000
 WHERE includes_dress = true AND dress_included_amount IS NULL AND deleted_at IS NULL;
UPDATE public.service_categories SET dress_included_amount = 17000
 WHERE id = 'f4cfdfa8-0805-4b20-8f8f-6a0dfd47e443' AND dress_included_amount IS NULL;
