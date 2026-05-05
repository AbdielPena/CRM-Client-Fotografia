-- Cierra advisors pre-existentes que comparten patrón con los recién arreglados.
--
-- 1. Funciones legacy con search_path mutable
-- 2. RLS en google_calendar_watches (solo service_role escribe; no exponer)
-- 3. Buckets públicos sin SELECT policy (las URLs públicas siguen funcionando)

-- ─── 1. Lockear search_path en funciones legacy ──────────────────────────────

create or replace function public.auto_book_project_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and new.project_id is not null then
    update projects
    set status = 'Reservado', updated_at = now()
    where id = new.project_id
      and status = 'Consulta inicial'
      and deleted_at is null;
  end if;
  return new;
end;
$$;

create or replace function public.cascade_delete_client(p_client_id uuid, p_studio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_ids uuid[];
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from clients where id = p_client_id and studio_id = p_studio_id and deleted_at is null
  ) then
    raise exception 'CLIENT_NOT_FOUND';
  end if;

  select array_agg(id) into v_project_ids
  from projects
  where client_id = p_client_id and studio_id = p_studio_id and deleted_at is null;

  if v_project_ids is not null and array_length(v_project_ids, 1) > 0 then
    update contracts set deleted_at = v_now
      where project_id = any(v_project_ids) and deleted_at is null;
    update invoices set deleted_at = v_now
      where project_id = any(v_project_ids) and deleted_at is null;
    update payments set deleted_at = v_now
      where project_id = any(v_project_ids) and deleted_at is null;
    update notes set deleted_at = v_now
      where project_id = any(v_project_ids) and deleted_at is null;
    delete from form_responses where project_id = any(v_project_ids);
    delete from availability_blocks where project_id = any(v_project_ids);
    delete from booking_requests where project_id = any(v_project_ids);
    delete from tag_assignments where project_id = any(v_project_ids);
    update projects set deleted_at = v_now where id = any(v_project_ids);
  end if;

  update notes set deleted_at = v_now
    where client_id = p_client_id and project_id is null and deleted_at is null;
  update invoices set deleted_at = v_now
    where client_id = p_client_id and project_id is null and deleted_at is null;
  update payments set deleted_at = v_now
    where client_id = p_client_id and project_id is null and deleted_at is null;
  delete from booking_requests where client_id = p_client_id;
  delete from contacts where client_id = p_client_id;
  delete from tag_assignments where client_id = p_client_id;
  update clients set deleted_at = v_now where id = p_client_id;
end;
$$;

create or replace function public.seed_default_project_statuses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_statuses (studio_id, label, color, position, is_default)
  values
    (new.id, 'Consulta inicial',       '#94a3b8', 0, true),
    (new.id, 'Reservado',              '#3b82f6', 1, false),
    (new.id, 'Sesión realizada',       '#8b5cf6', 2, false),
    (new.id, 'Esperando selección',    '#f59e0b', 3, false),
    (new.id, 'En edición',             '#6366f1', 4, false),
    (new.id, 'Impresión / Producción', '#ec4899', 5, false),
    (new.id, 'Impresión enviada',      '#14b8a6', 6, false),
    (new.id, 'Entregado',              '#10b981', 7, false),
    (new.id, 'Cancelado',              '#ef4444', 8, false)
  on conflict (studio_id, label) do nothing;
  return new;
end;
$$;

-- trigger_email_worker usa net.http_post (pg_net). search_path debe incluir net.
create or replace function public.trigger_email_worker()
returns void
language plpgsql
set search_path = public, net
as $$
declare
  v_url text := current_setting('app.functions_base_url', true);
  v_key text := current_setting('app.service_role_key', true);
begin
  if v_url is null or v_key is null then
    raise notice '[trigger_email_worker] skipped: settings not configured';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/email-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

-- ─── 2. RLS en google_calendar_watches ───────────────────────────────────────
alter table public.google_calendar_watches enable row level security;

drop policy if exists google_calendar_watches_member_read on public.google_calendar_watches;
create policy google_calendar_watches_member_read on public.google_calendar_watches
  for select using (public.is_studio_member(studio_id));

-- ─── 3. Buckets públicos: drop SELECT policies amplias ──────────────────────
drop policy if exists package_images_storage_select on storage.objects;
drop policy if exists branding_storage_select on storage.objects;
