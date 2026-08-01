ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS selection_close_trigger text;
COMMENT ON COLUMN public.packages.selection_close_trigger IS
  'Cuando se cierra la galeria de SELECCION de este plan: prints_sent (default), delivered o never. NUNCA vence por tiempo.';
COMMENT ON COLUMN public.packages.gallery_availability_days IS
  'Dias que dura la galeria de ENTREGA de este plan. NULL = 182 (6 meses).';
