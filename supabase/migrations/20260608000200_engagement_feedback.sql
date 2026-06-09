-- Engagement Hub Fase 4: feedback con estrellas + reseñas (Google/Facebook).
-- El cliente abre /fb/<token> (link del email {{review_link}}), califica 1-5:
--   >= 4 estrellas  → redirige a Google/Facebook review
--   < 4 estrellas   → captura comentario interno (no público)

-- Config por estudio (URLs de reseña + umbrales de segmentación).
create table if not exists public.engagement_config (
  studio_id uuid primary key references public.studios(id) on delete cascade,
  review_google_url text,
  review_facebook_url text,
  review_min_stars int not null default 4,
  vip_min_paid numeric,
  inactive_months int,
  birthday_window_days int,
  updated_at timestamptz not null default now()
);
alter table public.engagement_config enable row level security;
drop policy if exists engagement_config_member_all on public.engagement_config;
create policy engagement_config_member_all on public.engagement_config
  for all to public using (is_studio_member(studio_id)) with check (is_studio_member(studio_id));

-- Solicitudes/registros de feedback. Token = secreto del link público.
create table if not exists public.engagement_feedback (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  automation_id uuid references public.engagement_automations(id) on delete set null,
  token text not null unique,
  stars int check (stars between 1 and 5),
  comment text,
  review_platform text check (review_platform in ('google','facebook','internal')),
  status text not null default 'pending' check (status in ('pending','submitted')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index if not exists ix_engagement_feedback_studio on public.engagement_feedback(studio_id, status);
create index if not exists ix_engagement_feedback_client on public.engagement_feedback(client_id);
alter table public.engagement_feedback enable row level security;
drop policy if exists engagement_feedback_member_all on public.engagement_feedback;
create policy engagement_feedback_member_all on public.engagement_feedback
  for all to public using (is_studio_member(studio_id)) with check (is_studio_member(studio_id));
