-- Tiempo de entrega de IMPRESIONES, configurable por categoría.
--
-- Estaba fijo en el código: la tarea "Enviar impresiones" nacía siempre con
-- vencimiento a 3 días de publicar la entrega final. Para quinceañeras y bodas
-- el plazo real es de 2 a 4 semanas, así que 3 días marcaba todo como atrasado.
--
-- Es un eje distinto de `delivery_days` (ese es la entrega DIGITAL, anclada en
-- la selección y con tope de cumpleaños-2). Este cuenta desde que la galería
-- final se publica.

alter table public.service_categories
  add column if not exists print_delivery_days integer;

comment on column public.service_categories.print_delivery_days is
  'Días para entregar las IMPRESIONES, contados desde que se publica la galería final. Fija el vencimiento de la tarea "Enviar impresiones". NULL = 21 por defecto.';

-- Quinceañeras y bodas: 28 días (4 semanas, el tope del rango 2-4 que maneja
-- el estudio). Ajustable desde Configuración → Categorías.
update public.service_categories
   set print_delivery_days = 28
 where deleted_at is null
   and name in ('Quinceañera Luxury', 'Quinceañera Essentials', 'Bodas');
