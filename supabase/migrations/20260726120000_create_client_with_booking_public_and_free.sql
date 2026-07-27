-- ============================================================================
-- create_client_with_booking: aceptar cotizaciones manuales (públicas y libres)
-- ============================================================================
-- Dos límites impedían que una cotización manual aceptada por el CLIENTE
-- creara cliente + sesión + contrato:
--
--   1. Exigía auth.uid(). En la página pública /cotizacion/[token] quien acepta
--      es el cliente, que no tiene cuenta del CRM → 'UNAUTHENTICATED'.
--      Ahora, SOLO cuando el llamador es service_role (nuestro servidor) y no
--      hay sesión, se acepta un actor declarado en el payload (`actor_id`).
--      La comprobación de pertenencia al estudio (studio_members) sigue
--      aplicándose sobre ese actor: nadie puede declarar un actor ajeno.
--
--   2. Exigía un plan de la lista. Las cotizaciones libres (presupuesto escrito
--      a mano) no tienen plan → 'PACKAGE_NOT_FOUND'. Ahora, si no viene
--      `package_id`, el monto sale de `total_amount` y el nombre del trabajo de
--      `package_label`; el contrato usa la plantilla por defecto del estudio.
--
-- Todo lo demás queda idéntico. Los campos del paquete pasan de `v_package.X`
-- a variables sueltas para poder quedar nulos sin romper el flujo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_client_with_booking(
  p_studio_id uuid,
  p_payload jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_caller_role text;
  v_studio record;
  v_template contract_templates%ROWTYPE;
  v_client_id uuid;
  v_project_id uuid;
  v_invoice1_id uuid;
  v_invoice2_id uuid;
  v_contract_id uuid;
  v_invoice1_number text;
  v_invoice2_number text;
  v_total numeric;
  v_half numeric;
  v_remainder numeric;
  v_event_date date;
  v_reserve_due_date date;
  v_balance_offset int;
  v_balance_due_date date;
  v_currency text;
  v_project_name text;
  v_contract_title text;
  v_contract_body text;
  v_deposit_percent numeric;
  v_reserve_days int;
  v_skip_invoices boolean := coalesce((p_payload->>'skip_invoices')::boolean, false);
  -- Campos del plan, sueltos: en una cotización libre quedan nulos.
  v_package_id uuid;
  v_package_name text;
  v_package_price numeric;
  v_package_currency text;
  v_package_active boolean;
  v_package_deposit numeric;
  v_package_reserve_days int;
  v_package_balance_offset int;
  v_package_template_id uuid;
  v_package_label text;
begin
  -- Actor declarado: solo para llamadas internas de confianza (service_role).
  if v_actor is null and (p_payload->>'actor_id') is not null then
    v_caller_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), ''))::jsonb->>'role',
      current_user
    );
    if v_caller_role in ('service_role', 'postgres', 'supabase_admin') then
      v_actor := (p_payload->>'actor_id')::uuid;
    end if;
  end if;

  if v_actor is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if not exists (
    select 1 from studio_members
    where user_id = v_actor and studio_id = p_studio_id
  ) and not auth_is_platform_admin() then
    raise exception 'FORBIDDEN: no access to studio %', p_studio_id using errcode = '42501';
  end if;

  select id, name, currency, invoice_prefix into v_studio
  from studios
  where id = p_studio_id and deleted_at is null;
  if not found then
    raise exception 'STUDIO_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Plan de la lista (opcional desde las cotizaciones libres)
  if nullif(p_payload->>'package_id', '') is not null then
    select id, name, price, currency, is_active, deposit_percent, reserve_due_in_days,
           balance_due_offset_days, default_contract_template_id
      into v_package_id, v_package_name, v_package_price, v_package_currency,
           v_package_active, v_package_deposit, v_package_reserve_days,
           v_package_balance_offset, v_package_template_id
    from packages
    where id = (p_payload->>'package_id')::uuid
      and studio_id = p_studio_id
      and deleted_at is null;
    if not found then
      raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if not v_package_active then
      raise exception 'PACKAGE_INACTIVE' using errcode = 'P0001';
    end if;
  end if;

  -- Etiqueta del trabajo: el plan, o lo que se escribió en la cotización.
  v_package_label := coalesce(
    v_package_name,
    nullif(trim(p_payload->>'package_label'), ''),
    'Servicio fotográfico'
  );

  -- 1) Contrato vinculado AL PAQUETE (lo que el owner eligió en /settings/packages)
  if v_package_template_id is not null then
    select * into v_template
    from contract_templates
    where id = v_package_template_id
      and studio_id = p_studio_id and deleted_at is null and is_active;
  end if;
  -- 2) Fallback: default del studio → por nombre → primero activo
  if v_template.id is null then
    select * into v_template
    from contract_templates
    where studio_id = p_studio_id and deleted_at is null and is_active and is_default
    limit 1;
  end if;
  if v_template.id is null and v_package_name is not null then
    select * into v_template
    from contract_templates
    where studio_id = p_studio_id and deleted_at is null and is_active
      and name ilike '%' || v_package_name || '%'
    order by created_at asc
    limit 1;
  end if;
  if v_template.id is null then
    select * into v_template
    from contract_templates
    where studio_id = p_studio_id and deleted_at is null and is_active
    order by created_at asc
    limit 1;
  end if;
  if v_template.id is null then
    raise exception 'NO_CONTRACT_TEMPLATE' using errcode = 'P0001';
  end if;

  -- Sin plan, el monto es el acordado en la cotización.
  v_total := coalesce(v_package_price, (p_payload->>'total_amount')::numeric, 0);
  v_deposit_percent := coalesce((p_payload->>'deposit_percent')::numeric, v_package_deposit, 50);
  v_half := round(v_total * v_deposit_percent / 100, 2);
  v_remainder := round(v_total - v_half, 2);
  v_currency := coalesce(v_package_currency, v_studio.currency, 'DOP');

  v_event_date := (p_payload->>'event_date')::date;
  v_reserve_days := coalesce(
    (p_payload->>'reserve_due_in_days')::int,
    v_package_reserve_days,
    3
  );
  v_reserve_due_date := current_date + (v_reserve_days || ' days')::interval;

  -- Vencimiento del SALDO (2da factura) relativo a la fecha de la sesión.
  -- 0 = el día de la sesión, -1 = un día antes, +1 = un día después.
  v_balance_offset := coalesce(v_package_balance_offset, 0);
  v_balance_due_date := case
    when v_event_date is null then null
    else (v_event_date + (v_balance_offset || ' days')::interval)::date
  end;

  v_project_name := coalesce(
    nullif(trim(p_payload->>'project_name'), ''),
    (p_payload->>'name') || ' — ' || v_package_label
  );

  insert into clients (
    studio_id, name, email, phone, source, notes, address, city, country,
    instagram_handle, website_url
  ) values (
    p_studio_id,
    p_payload->>'name',
    nullif(p_payload->>'email', ''),
    nullif(p_payload->>'phone', ''),
    coalesce(nullif(p_payload->>'source', ''), 'manual')::lead_source,
    nullif(p_payload->>'notes', ''),
    nullif(p_payload->>'address', ''),
    nullif(p_payload->>'city', ''),
    coalesce(nullif(p_payload->>'country', ''), 'DO'),
    nullif(p_payload->>'instagram_handle', ''),
    nullif(p_payload->>'website_url', '')
  ) returning id into v_client_id;

  insert into projects (
    studio_id, client_id, package_id, name, event_type, status,
    event_date, location, total_amount, currency
  ) values (
    p_studio_id, v_client_id, v_package_id, v_project_name,
    nullif(p_payload->>'event_type', ''),
    'booked'::project_status,
    v_event_date,
    nullif(p_payload->>'location', ''),
    v_total,
    v_currency
  ) returning id into v_project_id;

  if not v_skip_invoices then
    v_invoice1_number := next_invoice_number(p_studio_id);
    v_invoice2_number := next_invoice_number(p_studio_id);

    insert into invoices (
      studio_id, project_id, client_id, invoice_number, sequence_number,
      title, kind, installment_number, installment_total,
      subtotal, tax_rate, tax_amount, discount_amount, total, amount_paid,
      currency, status, due_date, created_by
    ) values (
      p_studio_id, v_project_id, v_client_id, v_invoice1_number,
      (regexp_replace(v_invoice1_number, '^.*-(\d+)$', '\1'))::int,
      'Reserva (' || v_deposit_percent || '%) — ' || v_package_label,
      'deposit', 1, 2, v_half, 0, 0, 0, v_half, 0,
      v_currency, 'draft'::invoice_status, v_reserve_due_date, v_actor
    ) returning id into v_invoice1_id;
    insert into invoice_items (invoice_id, studio_id, description, quantity, unit_price, sort_order)
    values (v_invoice1_id, p_studio_id, 'Reserva — ' || v_package_label, 1, v_half, 0);

    insert into invoices (
      studio_id, project_id, client_id, invoice_number, sequence_number,
      title, kind, installment_number, installment_total,
      subtotal, tax_rate, tax_amount, discount_amount, total, amount_paid,
      currency, status, due_date, created_by
    ) values (
      p_studio_id, v_project_id, v_client_id, v_invoice2_number,
      (regexp_replace(v_invoice2_number, '^.*-(\d+)$', '\1'))::int,
      'Saldo (' || (100 - v_deposit_percent) || '%) — ' || v_package_label,
      'balance', 2, 2, v_remainder, 0, 0, 0, v_remainder, 0,
      v_currency, 'draft'::invoice_status, v_balance_due_date, v_actor
    ) returning id into v_invoice2_id;
    insert into invoice_items (invoice_id, studio_id, description, quantity, unit_price, sort_order)
    values (v_invoice2_id, p_studio_id, 'Saldo final — ' || v_package_label, 1, v_remainder, 0);
  end if;

  v_contract_title := 'Contrato ' || v_package_label || ' — ' || (p_payload->>'name');
  v_contract_body := v_template.body_html;
  v_contract_body := replace(v_contract_body, '{{studio_name}}', v_studio.name);
  v_contract_body := replace(v_contract_body, '{{client_name}}', p_payload->>'name');
  v_contract_body := replace(v_contract_body, '{{client_email}}', coalesce(p_payload->>'email', ''));
  v_contract_body := replace(v_contract_body, '{{client_phone}}', coalesce(p_payload->>'phone', ''));
  v_contract_body := replace(v_contract_body, '{{project_name}}', v_project_name);
  v_contract_body := replace(v_contract_body, '{{event_type}}', coalesce(p_payload->>'event_type', ''));
  v_contract_body := replace(v_contract_body, '{{event_date}}', to_char(v_event_date, 'DD/MM/YYYY'));
  v_contract_body := replace(v_contract_body, '{{location}}', coalesce(p_payload->>'location', ''));
  v_contract_body := replace(v_contract_body, '{{package_name}}', v_package_label);
  v_contract_body := replace(v_contract_body, '{{package_price}}', v_total::text);
  v_contract_body := replace(v_contract_body, '{{currency}}', v_currency);
  v_contract_body := replace(v_contract_body, '{{deposit_amount}}', v_half::text);
  v_contract_body := replace(v_contract_body, '{{balance_amount}}', v_remainder::text);
  v_contract_body := replace(v_contract_body, '{{balance_due_date}}', to_char(coalesce(v_balance_due_date, v_event_date), 'DD/MM/YYYY'));

  insert into contracts (
    studio_id, project_id, template_id, title, body_html, body_snapshot,
    status, created_by, expires_at
  ) values (
    p_studio_id, v_project_id, v_template.id, v_contract_title, v_contract_body,
    jsonb_build_object(
      'package_id', v_package_id, 'package_name', v_package_label,
      'total', v_total, 'deposit', v_half, 'balance', v_remainder,
      'currency', v_currency, 'event_date', v_event_date
    ),
    'draft'::contract_status, v_actor,
    now() + (v_template.default_validity_days || ' days')::interval
  ) returning id into v_contract_id;

  insert into activity_log (
    studio_id, actor_type, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    p_studio_id, 'user'::actor_type, v_actor, 'client.created', 'client', v_client_id,
    jsonb_build_object('name', p_payload->>'name', 'package_id', v_package_id,
      'project_id', v_project_id, 'contract_id', v_contract_id, 'skip_invoices', v_skip_invoices)
  );

  return jsonb_build_object(
    'client_id', v_client_id, 'project_id', v_project_id,
    'invoice1_id', v_invoice1_id, 'invoice2_id', v_invoice2_id,
    'invoice1_number', v_invoice1_number, 'invoice2_number', v_invoice2_number,
    'contract_id', v_contract_id
  );
end;
$function$;
