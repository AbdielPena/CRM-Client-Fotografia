-- Mensaje de agradecimiento POR CATEGORÍA de servicio. Se muestra en la galería
-- de entrega cuando el bloque de dedicatoria está habilitado pero no hay texto
-- de la madre (sesiones que no llevan dedicatoria: bodas, corporativo, etc.).
-- Si la categoría no tiene mensaje (o la galería no tiene categoría), la vista
-- pública cae a un agradecimiento genérico por defecto (en código).
ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS thankyou_message text;
