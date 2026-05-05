-- Soporte para registro público de clientes (sin paquete asignado).
-- El studio comparte /r/<slug> y el cliente se registra por sí mismo.

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='clients' and column_name='source'
  ) then
    alter table public.clients add column source text;
  end if;
end $$;

-- ─── Enum: agregar 'client_registered' ─────────────────────────────────────
do $$ begin
  alter type notification_type add value if not exists 'client_registered';
exception when duplicate_object then null; end $$;

-- ─── RPC para registro público ─────────────────────────────────────────────
create or replace function public.public_register_client(
  p_studio_slug text,
  p_name        text,
  p_email       text,
  p_phone       text,
  p_notes       text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio_id uuid;
  v_studio_name text;
  v_existing uuid;
  v_client_id uuid;
begin
  select id, name into v_studio_id, v_studio_name
  from studios
  where slug = p_studio_slug
    and deleted_at is null
  limit 1;
  if v_studio_id is null then
    raise exception 'STUDIO_NOT_FOUND';
  end if;

  p_name := nullif(trim(p_name), '');
  p_email := lower(nullif(trim(p_email), ''));
  p_phone := nullif(trim(p_phone), '');
  p_notes := nullif(trim(p_notes), '');

  if p_name is null or p_email is null then
    raise exception 'VALIDATION_FAILED';
  end if;

  select id into v_existing
  from clients
  where studio_id = v_studio_id
    and lower(email) = p_email
    and deleted_at is null
  limit 1;

  if v_existing is not null then
    return json_build_object(
      'client_id', v_existing,
      'studio_id', v_studio_id,
      'studio_name', v_studio_name,
      'created', false
    );
  end if;

  insert into clients (studio_id, name, email, phone, notes, source)
  values (v_studio_id, p_name, p_email, p_phone, p_notes, 'public_form')
  returning id into v_client_id;

  insert into notifications (
    studio_id, type, title, body, action_url, related_entity_type, related_entity_id
  )
  values (
    v_studio_id,
    'client_registered',
    'Nuevo cliente registrado',
    p_name || ' (' || p_email || ') se registró desde el formulario público.',
    '/clients/' || v_client_id::text,
    'client',
    v_client_id
  );

  return json_build_object(
    'client_id', v_client_id,
    'studio_id', v_studio_id,
    'studio_name', v_studio_name,
    'created', true
  );
end;
$$;

grant execute on function public.public_register_client(text,text,text,text,text) to anon;
grant execute on function public.public_register_client(text,text,text,text,text) to authenticated;
