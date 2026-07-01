-- Configuración del FORMULARIO PÚBLICO de solicitud de reserva, por estudio.
-- Guarda (jsonb): textos (intro/consent/submit), overrides de los campos fijos
-- (ocultar/renombrar/obligar) y las preguntas propias del estudio.
-- El render vive en app/p/[studio]/[pkg]/book; ver lib/forms/booking-form.ts.
create table if not exists public.studio_booking_form (
  studio_id  uuid primary key references public.studios(id) on delete cascade,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.studio_booking_form enable row level security;

-- Staff del estudio: control total (leer/escribir su propia config).
drop policy if exists studio_booking_form_member_all on public.studio_booking_form;
create policy studio_booking_form_member_all
  on public.studio_booking_form
  for all
  using (
    studio_id in (
      select sm.studio_id from public.studio_members sm where sm.user_id = auth.uid()
    )
  )
  with check (
    studio_id in (
      select sm.studio_id from public.studio_members sm where sm.user_id = auth.uid()
    )
  );

-- Nota: la lectura pública para el formulario se hace server-side con service
-- role (resolviendo el estudio por slug), así que NO se expone a anon por RLS.

comment on table public.studio_booking_form is
  'Config del formulario público de solicitud de reserva por estudio (textos, campos fijos configurables, preguntas propias).';
