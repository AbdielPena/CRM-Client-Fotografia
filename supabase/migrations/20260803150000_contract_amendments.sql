-- Modificaciones de contrato con re-firma.
--
-- Cuando el estudio cambia un contrato YA FIRMADO (por ejemplo, corregir el
-- monto), la firma anterior no se puede simplemente borrar: es la prueba de lo
-- que el cliente aceptó ese día. Se archiva aquí, el contrato vuelve a quedar
-- pendiente de firma, y el cliente recibe el detalle de lo que cambió.
--
-- Idempotente: se puede correr dos veces sin romper nada.

create table if not exists public.contract_amendments (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references public.studios(id) on delete cascade,
  contract_id       uuid not null references public.contracts(id) on delete cascade,

  -- 1 = primera modificación después de la firma original.
  version           integer not null,

  -- Lo que el estudio le explica al cliente ("Ajuste de precio al pactado").
  summary           text not null,
  -- [{ campo, antes, despues }] — se muestra tal cual en el correo y al firmar.
  changes           jsonb not null default '[]'::jsonb,

  -- Estado del contrato ANTES de esta modificación (la prueba que se archiva).
  previous_status               text,
  previous_signed_at            timestamptz,
  previous_signed_name          text,
  previous_signed_email         text,
  previous_signed_ip            text,
  previous_signature_image_url  text,
  previous_evidence_hash        text,
  previous_body_snapshot        text,

  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists contract_amendments_contract_idx
  on public.contract_amendments (contract_id, version desc);
create index if not exists contract_amendments_studio_idx
  on public.contract_amendments (studio_id, created_at desc);

alter table public.contract_amendments enable row level security;

-- Solo el estudio dueño ve su historial. El cliente no entra por aquí: lo que
-- necesita saber viaja en el correo y en la página de firma (por token).
drop policy if exists contract_amendments_studio_all on public.contract_amendments;
create policy contract_amendments_studio_all
  on public.contract_amendments
  for all
  using (
    studio_id in (
      select sm.studio_id from public.studio_members sm
      where sm.user_id = auth.uid()
    )
  )
  with check (
    studio_id in (
      select sm.studio_id from public.studio_members sm
      where sm.user_id = auth.uid()
    )
  );

comment on table public.contract_amendments is
  'Historial de modificaciones de un contrato. Guarda la firma anterior antes de pedir re-firma.';

notify pgrst, 'reload schema';
