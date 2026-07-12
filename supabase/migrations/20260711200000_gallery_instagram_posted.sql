-- Checklist "publicado en Instagram" por galería ENTREGADA. El estudio marca
-- cada entrega final cuando ya la subió a Instagram, para llevar el orden de qué
-- se compartió. NULL = pendiente; timestamp = ya publicado.
alter table galleries
  add column if not exists instagram_posted_at timestamptz;
