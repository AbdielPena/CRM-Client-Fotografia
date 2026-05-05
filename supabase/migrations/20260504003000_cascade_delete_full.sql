-- Cascada de soft-delete real para clients, projects, packages.
-- Las FKs con ON DELETE CASCADE solo disparan en HARD delete; este sistema
-- usa soft delete (deleted_at IS NULL como filtro). Estas funciones replican
-- la cascada lógicamente.

-- ─── cascade_delete_project ────────────────────────────────────────────────
create or replace function public.cascade_delete_project(
  p_project_id uuid,
  p_studio_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from projects
    where id = p_project_id and studio_id = p_studio_id and deleted_at is null
  ) then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  update contracts set deleted_at = v_now
    where project_id = p_project_id and deleted_at is null;
  update invoices set deleted_at = v_now
    where project_id = p_project_id and deleted_at is null;
  update payments set deleted_at = v_now
    where project_id = p_project_id and deleted_at is null;
  update notes set deleted_at = v_now
    where project_id = p_project_id and deleted_at is null;
  update galleries set deleted_at = v_now, status = 'archived'
    where project_id = p_project_id and deleted_at is null;

  delete from form_responses where project_id = p_project_id;
  delete from availability_blocks where project_id = p_project_id;
  delete from booking_requests where project_id = p_project_id;
  delete from tag_assignments where project_id = p_project_id;

  update projects set deleted_at = v_now where id = p_project_id;
end;
$$;

-- ─── cascade_delete_package ────────────────────────────────────────────────
create or replace function public.cascade_delete_package(
  p_package_id uuid,
  p_studio_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now        timestamptz := now();
  v_project_id uuid;
begin
  if not exists (
    select 1 from packages
    where id = p_package_id and studio_id = p_studio_id and deleted_at is null
  ) then
    raise exception 'PACKAGE_NOT_FOUND';
  end if;

  for v_project_id in
    select id from projects
    where package_id = p_package_id
      and studio_id = p_studio_id
      and deleted_at is null
  loop
    perform public.cascade_delete_project(v_project_id, p_studio_id);
  end loop;

  update public_booking_links set is_active = false
    where package_id = p_package_id and deleted_at is null;

  update booking_requests set status = 'cancelled'
    where package_id = p_package_id and status not in ('approved','cancelled','rejected');

  update packages set deleted_at = v_now, is_active = false
    where id = p_package_id;
end;
$$;

-- ─── cascade_delete_client (extiende para galerías) ─────────────────────────
create or replace function public.cascade_delete_client(p_client_id uuid, p_studio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_ids uuid[];
  v_pid uuid;
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
    foreach v_pid in array v_project_ids loop
      perform public.cascade_delete_project(v_pid, p_studio_id);
    end loop;
  end if;

  update notes set deleted_at = v_now
    where client_id = p_client_id and project_id is null and deleted_at is null;
  update invoices set deleted_at = v_now
    where client_id = p_client_id and project_id is null and deleted_at is null;
  update payments set deleted_at = v_now
    where client_id = p_client_id and project_id is null and deleted_at is null;
  update galleries set deleted_at = v_now, status = 'archived'
    where client_id = p_client_id and project_id is null and deleted_at is null;

  update booking_requests set status = 'cancelled'
    where client_id = p_client_id and status not in ('approved','cancelled','rejected');

  delete from contacts where client_id = p_client_id;
  delete from tag_assignments where client_id = p_client_id;

  update clients set deleted_at = v_now where id = p_client_id;
end;
$$;
