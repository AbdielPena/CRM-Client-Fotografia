-- Engagement Hub: publicación de reseñas en sitio web público.
-- Cuando una reseña tiene stars >= cfg.review_min_stars Y un comentario válido,
-- se marca published=true y se sirve desde GET /api/public/reviews para que
-- abbypixel.com (sitio estático) la muestre en /resenas/.
-- También permite reseñas creadas manualmente desde StudioFlow (created_via='manual').

alter table public.engagement_feedback
  add column if not exists published boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists display_name text,
  add column if not exists photo_url text,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists project_title text,
  add column if not exists created_via text not null default 'feedback'
    check (created_via in ('feedback','manual'));

-- Índice para el endpoint público — orden cronológico inverso por studio.
create index if not exists ix_engagement_feedback_published
  on public.engagement_feedback(studio_id, published, published_at desc)
  where published = true;
