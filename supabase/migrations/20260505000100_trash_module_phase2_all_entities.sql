-- Trash Module — Fase 2: projects, contracts, invoices, galleries, deliveries
-- Aplicada en producción el 2026-05-05.
--
-- Agrega deletion_reason a las entidades core y crea RPCs de
-- soft-delete (con reason), restore y hard-delete por entidad.

-- ============================================================================
-- 0. Columnas deletion_reason
-- ============================================================================

alter table public.projects add column if not exists deletion_reason text;
alter table public.contracts add column if not exists deletion_reason text;
alter table public.invoices add column if not exists deletion_reason text;
alter table public.galleries add column if not exists deletion_reason text;
alter table public.client_deliveries add column if not exists deletion_reason text;

-- ============================================================================
-- 1. PROJECT — soft delete, restore, hard delete (con cascada)
-- ============================================================================

create or replace function public.soft_delete_project(
  p_project_id uuid, p_studio_id uuid, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := now();
begin
  if not exists (select 1 from projects where id = p_project_id and studio_id = p_studio_id and deleted_at is null) then
    raise exception 'PROJECT_NOT_FOUND';
  end if;
  update contracts set deleted_at = v_now, updated_at = v_now where project_id = p_project_id and deleted_at is null;
  update invoices set deleted_at = v_now, updated_at = v_now where project_id = p_project_id and deleted_at is null;
  update payments set deleted_at = v_now, updated_at = v_now
    where invoice_id in (select id from invoices where project_id = p_project_id) and deleted_at is null;
  update notes set deleted_at = v_now, updated_at = v_now where project_id = p_project_id and deleted_at is null;
  update galleries set deleted_at = v_now, status = 'archived', updated_at = v_now where project_id = p_project_id and deleted_at is null;
  update client_deliveries set deleted_at = v_now, updated_at = v_now where project_id = p_project_id and deleted_at is null;
  update projects set deleted_at = v_now, deletion_reason = p_reason, updated_at = v_now where id = p_project_id and studio_id = p_studio_id;
end; $$;

create or replace function public.restore_project(
  p_project_id uuid, p_studio_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare v_client_deleted boolean;
begin
  if not exists (select 1 from projects where id = p_project_id and studio_id = p_studio_id and deleted_at is not null) then
    raise exception 'PROJECT_NOT_TRASHED';
  end if;
  select exists (select 1 from clients c join projects p on p.client_id = c.id where p.id = p_project_id and c.deleted_at is not null) into v_client_deleted;
  if v_client_deleted then raise exception 'CLIENT_IS_TRASHED'; end if;
  update contracts set deleted_at = null, updated_at = now() where project_id = p_project_id;
  update invoices set deleted_at = null, updated_at = now() where project_id = p_project_id;
  update payments set deleted_at = null, updated_at = now() where invoice_id in (select id from invoices where project_id = p_project_id);
  update notes set deleted_at = null, updated_at = now() where project_id = p_project_id;
  update galleries set deleted_at = null, status = case when status = 'archived' then 'active' else status end, updated_at = now() where project_id = p_project_id;
  update client_deliveries set deleted_at = null, updated_at = now() where project_id = p_project_id;
  update projects set deleted_at = null, deletion_reason = null, updated_at = now() where id = p_project_id and studio_id = p_studio_id;
end; $$;

create or replace function public.hard_delete_project(
  p_project_id uuid, p_studio_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare v_invoice_ids uuid[];
begin
  if not exists (select 1 from projects where id = p_project_id and studio_id = p_studio_id and deleted_at is not null) then
    raise exception 'PROJECT_NOT_TRASHED';
  end if;
  select array_agg(id) into v_invoice_ids from invoices where project_id = p_project_id;
  if v_invoice_ids is not null then delete from payments where invoice_id = any(v_invoice_ids); end if;
  delete from invoices where project_id = p_project_id;
  delete from contracts where project_id = p_project_id;
  delete from notes where project_id = p_project_id;
  delete from galleries where project_id = p_project_id;
  delete from client_deliveries where project_id = p_project_id;
  delete from projects where id = p_project_id and studio_id = p_studio_id;
end; $$;

-- ============================================================================
-- 2. CONTRACT — soft delete, restore, hard delete
-- ============================================================================

create or replace function public.soft_delete_contract(
  p_contract_id uuid, p_studio_id uuid, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from contracts where id = p_contract_id and studio_id = p_studio_id and deleted_at is null) then
    raise exception 'CONTRACT_NOT_FOUND';
  end if;
  update contracts set deleted_at = now(), deletion_reason = p_reason, updated_at = now() where id = p_contract_id and studio_id = p_studio_id;
end; $$;

create or replace function public.restore_contract(
  p_contract_id uuid, p_studio_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from contracts where id = p_contract_id and studio_id = p_studio_id and deleted_at is not null) then
    raise exception 'CONTRACT_NOT_TRASHED';
  end if;
  if exists (select 1 from contracts c join projects p on c.project_id = p.id where c.id = p_contract_id and p.deleted_at is not null) then
    raise exception 'PROJECT_IS_TRASHED';
  end if;
  update contracts set deleted_at = null, deletion_reason = null, updated_at = now() where id = p_contract_id and studio_id = p_studio_id;
end; $$;

create or replace function public.hard_delete_contract(
  p_contract_id uuid, p_studio_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from contracts where id = p_contract_id and studio_id = p_studio_id and deleted_at is not null) then
    raise exception 'CONTRACT_NOT_TRASHED';
  end if;
  delete from contracts where id = p_contract_id and studio_id = p_studio_id;
end; $$;

-- ============================================================================
-- 3. INVOICE — soft delete, restore, hard delete (cascada a payments)
-- ============================================================================

create or replace function public.soft_delete_invoice(
  p_invoice_id uuid, p_studio_id uuid, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := now();
begin
  if not exists (select 1 from invoices where id = p_invoice_id and studio_id = p_studio_id and deleted_at is null) then
    raise exception 'INVOICE_NOT_FOUND';
  end if;
  update payments set deleted_at = v_now, updated_at = v_now where invoice_id = p_invoice_id and deleted_at is null;
  update invoices set deleted_at = v_now, deletion_reason = p_reason, updated_at = v_now where id = p_invoice_id and studio_id = p_studio_id;
end; $$;

create or replace function public.restore_invoice(
  p_invoice_id uuid, p_studio_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from invoices where id = p_invoice_id and studio_id = p_studio_id and deleted_at is not null) then
    raise exception 'INVOICE_NOT_TRASHED';
  end if;
  if exists (select 1 from invoices i join projects p on i.project_id = p.id where i.id = p_invoice_id and p.deleted_at is not null) then
    raise exception 'PROJECT_IS_TRASHED';
  end if;
  update payments set deleted_at = null, updated_at = now() where invoice_id = p_invoice_id;
  update invoices set deleted_at = null, deletion_reason = null, updated_at = now() where id = p_invoice_id and studio_id = p_studio_id;
end; $$;

create or replace function public.hard_delete_invoice(
  p_invoice_id uuid, p_studio_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from invoices where id = p_invoice_id and studio_id = p_studio_id and deleted_at is not null) then
    raise exception 'INVOICE_NOT_TRASHED';
  end if;
  delete from payments where invoice_id = p_invoice_id;
  delete from invoices where id = p_invoice_id and studio_id = p_studio_id;
end; $$;

-- ============================================================================
-- 4. GALLERY — soft delete, restore, hard delete (cascada a assets/collections)
-- ============================================================================

create or replace function public.soft_delete_gallery(
  p_gallery_id uuid, p_studio_id uuid, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := now();
begin
  if not exists (select 1 from galleries where id = p_gallery_id and studio_id = p_studio_id and deleted_at is null) then
    raise exception 'GALLERY_NOT_FOUND';
  end if;
  update gallery_assets set deleted_at = v_now where gallery_id = p_gallery_id and deleted_at is null;
  update gallery_collections set deleted_at = v_now where gallery_id = p_gallery_id and deleted_at is null;
  update galleries set deleted_at = v_now, status = 'archived', deletion_reason = p_reason, updated_at = v_now where id = p_gallery_id and studio_id = p_studio_id;
end; $$;

create or replace function public.restore_gallery(
  p_gallery_id uuid, p_studio_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from galleries where id = p_gallery_id and studio_id = p_studio_id and deleted_at is not null) then
    raise exception 'GALLERY_NOT_TRASHED';
  end if;
  if exists (select 1 from galleries g join projects p on g.project_id = p.id where g.id = p_gallery_id and p.deleted_at is not null) then
    raise exception 'PROJECT_IS_TRASHED';
  end if;
  update gallery_assets set deleted_at = null where gallery_id = p_gallery_id;
  update gallery_collections set deleted_at = null where gallery_id = p_gallery_id;
  update galleries set deleted_at = null, status = case when status = 'archived' then 'active' else status end, deletion_reason = null, updated_at = now() where id = p_gallery_id and studio_id = p_studio_id;
end; $$;

create or replace function public.hard_delete_gallery(
  p_gallery_id uuid, p_studio_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from galleries where id = p_gallery_id and studio_id = p_studio_id and deleted_at is not null) then
    raise exception 'GALLERY_NOT_TRASHED';
  end if;
  delete from gallery_assets where gallery_id = p_gallery_id;
  delete from gallery_collections where gallery_id = p_gallery_id;
  delete from galleries where id = p_gallery_id and studio_id = p_studio_id;
end; $$;

-- ============================================================================
-- 5. DELIVERY — soft delete, restore, hard delete
-- ============================================================================

create or replace function public.soft_delete_delivery(
  p_delivery_id uuid, p_studio_id uuid, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from client_deliveries where id = p_delivery_id and studio_id = p_studio_id and deleted_at is null) then
    raise exception 'DELIVERY_NOT_FOUND';
  end if;
  update client_deliveries set deleted_at = now(), deletion_reason = p_reason, updated_at = now() where id = p_delivery_id and studio_id = p_studio_id;
end; $$;

create or replace function public.restore_delivery(
  p_delivery_id uuid, p_studio_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from client_deliveries where id = p_delivery_id and studio_id = p_studio_id and deleted_at is not null) then
    raise exception 'DELIVERY_NOT_TRASHED';
  end if;
  update client_deliveries set deleted_at = null, deletion_reason = null, updated_at = now() where id = p_delivery_id and studio_id = p_studio_id;
end; $$;

create or replace function public.hard_delete_delivery(
  p_delivery_id uuid, p_studio_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from client_deliveries where id = p_delivery_id and studio_id = p_studio_id and deleted_at is not null) then
    raise exception 'DELIVERY_NOT_TRASHED';
  end if;
  delete from client_deliveries where id = p_delivery_id and studio_id = p_studio_id;
end; $$;
