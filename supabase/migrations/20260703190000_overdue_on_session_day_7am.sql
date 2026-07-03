-- Regla del dueño: las facturas de sesión vencen AL COMENZAR el día de la sesión
-- (projects.event_date), a las 7 AM RD. Antes se marcaban "vencida" el día
-- DESPUÉS de la sesión (due_date < current_date + exclusión event_date >= hoy).
--
-- Cambios (paso 0 de run_studio_automations):
--   due_date < current_date        -> due_date <= current_date   (el día de, no el día después)
--   pp.event_date >= current_date  -> pp.event_date > current_date (solo protege sesiones FUTURAS)
-- Neto: se marca vencida en max(due_date, event_date); con offset 0 = el día del evento.
-- Además: el cron studio-automations-daily pasa a las 7 AM RD (11:00 UTC).

CREATE OR REPLACE FUNCTION public.run_studio_automations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total integer := 0;
  v_n integer;
begin
  -- 0) Marcar facturas vencidas
  update invoices set status='overdue', updated_at=now()
   where deleted_at is null and due_date <= current_date
     and status in ('sent','viewed','pending','partially_paid')
     and not exists (select 1 from projects pp where pp.id=invoices.project_id and pp.deleted_at is null and pp.event_date is not null and pp.event_date > current_date);

  -- 1) COBRANZA: factura por vencer (≤3 días)
  insert into notifications (studio_id,type,title,body,action_url,related_entity_type,related_entity_id)
  select i.studio_id,'invoice_due_soon','Factura por vencer',
    'Factura '||i.invoice_number||' de '||coalesce(c.name,'cliente')||' vence el '||to_char(i.due_date,'DD/MM')||'.',
    '/invoices/'||i.id,'invoice',i.id
  from invoices i left join clients c on c.id=i.client_id
  where i.deleted_at is null and i.due_date between current_date and current_date+3
    and i.status in ('sent','viewed','pending','partially_paid')
    and not exists (select 1 from notifications n where n.related_entity_id=i.id and n.type='invoice_due_soon' and n.created_at::date=current_date);
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  -- 2) COBRANZA: factura vencida
  insert into notifications (studio_id,type,title,body,action_url,related_entity_type,related_entity_id)
  select i.studio_id,'invoice_overdue','Factura vencida',
    'Factura '||i.invoice_number||' de '||coalesce(c.name,'cliente')||' venció el '||to_char(i.due_date,'DD/MM')||'.',
    '/invoices/'||i.id,'invoice',i.id
  from invoices i left join clients c on c.id=i.client_id
  where i.deleted_at is null and i.status='overdue'
    and not exists (select 1 from notifications n where n.related_entity_id=i.id and n.type='invoice_overdue' and n.created_at::date=current_date);
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  -- 3) COBRANZA: cobrar balance antes del evento (sesión en ≤10 días con saldo)
  insert into notifications (studio_id,type,title,body,action_url,related_entity_type,related_entity_id)
  select p.studio_id,'balance_due_reminder','Cobrar balance antes del evento',
    'La sesión de '||coalesce(c.name,'cliente')||' es el '||to_char(p.event_date,'DD/MM')||' y la factura aún tiene saldo pendiente.',
    '/projects/'||p.id,'project',p.id
  from projects p left join clients c on c.id=p.client_id
  where p.deleted_at is null and p.event_date between current_date and current_date+10
    and exists (select 1 from invoices i where i.project_id=p.id and i.deleted_at is null
                 and i.status in ('sent','viewed','pending','partially_paid','overdue') and (i.total - i.amount_paid) > 0)
    and not exists (select 1 from notifications n where n.related_entity_id=p.id and n.type='balance_due_reminder' and n.created_at::date=current_date);
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  -- 4) COBRANZA: reserva aprobada sin pagar (>2 días)
  insert into notifications (studio_id,type,title,body,action_url,related_entity_type,related_entity_id)
  select br.studio_id,'reservation_unpaid','Reserva sin pagar',
    coalesce(br.client_name,'Cliente')||' aprobó su sesión pero aún no paga la reserva.',
    '/bookings/'||br.id,'booking_request',br.id
  from booking_requests br
  where br.status in ('approved','awaiting_payment') and br.approved_at < now() - interval '2 days'
    and not exists (select 1 from payments pay where pay.project_id=br.project_id and pay.status='completed')
    and not exists (select 1 from notifications n where n.related_entity_id=br.id and n.type='reservation_unpaid' and n.created_at::date=current_date);
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  -- 5) SESIONES: recordatorio de sesión (en 3 días y en 1 día)
  insert into notifications (studio_id,type,title,body,action_url,related_entity_type,related_entity_id)
  select p.studio_id,'session_reminder','Sesión próxima',
    'Sesión de '||coalesce(c.name,'cliente')||' el '||to_char(p.event_date,'DD/MM')||
      coalesce(' · '||to_char(p.event_time,'HH12:MI'),'')||coalesce(' · '||p.location,'')||'.',
    '/projects/'||p.id,'project',p.id
  from projects p left join clients c on c.id=p.client_id
  where p.deleted_at is null and p.event_date in (current_date+1, current_date+3)
    and not exists (select 1 from notifications n where n.related_entity_id=p.id and n.type='session_reminder' and n.created_at::date=current_date);
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  -- 6) PENDIENTES: contrato sin firmar (>2 días enviado)
  insert into notifications (studio_id,type,title,body,action_url,related_entity_type,related_entity_id)
  select ct.studio_id,'contract_unsigned','Contrato sin firmar',
    'Un contrato lleva sin firmar desde el '||to_char(ct.sent_at,'DD/MM')||'. Recuérdaselo al cliente.',
    '/contracts/'||ct.id,'contract',ct.id
  from contracts ct
  where ct.deleted_at is null and ct.status in ('sent','viewed') and ct.sent_at < now() - interval '2 days'
    and not exists (select 1 from notifications n where n.related_entity_id=ct.id and n.type='contract_unsigned' and n.created_at::date=current_date);
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  -- 7) PENDIENTES: formulario sin completar (>2 días)
  insert into notifications (studio_id,type,title,body,related_entity_type,related_entity_id)
  select fr.studio_id,'form_pending','Formulario sin completar',
    'Un formulario sigue sin completarse (enviado el '||to_char(coalesce(fr.sent_at,fr.created_at),'DD/MM')||').',
    'form_response',fr.id
  from form_responses fr
  where fr.status in ('sent','in_progress') and coalesce(fr.sent_at,fr.created_at) < now() - interval '2 days'
    and not exists (select 1 from notifications n where n.related_entity_id=fr.id and n.type='form_pending' and n.created_at::date=current_date);
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  -- 8) PENDIENTES: galería compartida sin selección (>3 días)
  insert into notifications (studio_id,type,title,body,action_url,related_entity_type,related_entity_id)
  select g.studio_id,'gallery_selection_pending','Galería sin selección',
    'El cliente aún no envía su selección de fotos.',
    '/galleries/'||g.id,'gallery',g.id
  from galleries g
  where g.deleted_at is null and g.selection_enabled = true and coalesce(g.selection_submitted,false) = false
    and g.created_at < now() - interval '3 days'
    and not exists (select 1 from notifications n where n.related_entity_id=g.id and n.type='gallery_selection_pending' and n.created_at::date=current_date);
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  -- 9) PENDIENTES: solicitud sin revisar (>24h)
  insert into notifications (studio_id,type,title,body,action_url,related_entity_type,related_entity_id)
  select br.studio_id,'booking_unreviewed','Solicitud sin revisar',
    'La solicitud de '||coalesce(br.client_name,'un cliente')||' lleva más de 24h esperando revisión.',
    '/bookings/'||br.id,'booking_request',br.id
  from booking_requests br
  where br.status='pending_review' and br.created_at < now() - interval '24 hours'
    and not exists (select 1 from notifications n where n.related_entity_id=br.id and n.type='booking_unreviewed' and n.created_at::date=current_date);
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  -- 10) CRECIMIENTO: pedir reseña (entregada hace 2–10 días, una sola vez)
  insert into notifications (studio_id,type,title,body,action_url,related_entity_type,related_entity_id)
  select cd.studio_id,'review_request','Pedir reseña',
    'Entregaste las fotos de '||coalesce(c.name,'un cliente')||'. Buen momento para pedir una reseña.',
    '/deliveries','client_delivery',cd.id
  from client_deliveries cd left join clients c on c.id=cd.client_id
  where cd.deleted_at is null and cd.status='entregada'
    and cd.delivered_at between now() - interval '10 days' and now() - interval '2 days'
    and not exists (select 1 from notifications n where n.related_entity_id=cd.id and n.type='review_request');
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  -- 11) CRECIMIENTO: aniversario de la sesión (1 año, re-booking)
  insert into notifications (studio_id,type,title,body,action_url,related_entity_type,related_entity_id)
  select p.studio_id,'anniversary_reminder','Aniversario de sesión',
    'Hace un año fue la sesión de '||coalesce(c.name,'un cliente')||'. Ofrécele una nueva.',
    '/projects/'||p.id,'project',p.id
  from projects p left join clients c on c.id=p.client_id
  where p.deleted_at is null and p.event_date is not null
    and (p.event_date + interval '1 year')::date = current_date
    and not exists (select 1 from notifications n where n.related_entity_id=p.id and n.type='anniversary_reminder' and n.created_at > now() - interval '300 days');
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  -- 12) RESUMEN DIARIO por studio (solo si hay algo accionable)
  insert into notifications (studio_id,type,title,body)
  select s.id,'daily_digest','Resumen del día',
    'Hoy: '||
    (select count(*) from projects p where p.studio_id=s.id and p.deleted_at is null and p.event_date=current_date)||' sesión(es) · '||
    (select count(*) from invoices i where i.studio_id=s.id and i.deleted_at is null and i.status='overdue')||' factura(s) vencida(s) · '||
    (select count(*) from booking_requests br where br.studio_id=s.id and br.status='pending_review')||' solicitud(es) por revisar · '||
    (select count(*) from client_deliveries cd where cd.studio_id=s.id and cd.deleted_at is null and cd.status<>'entregada' and cd.birthday between current_date and current_date+7)||' cumpleaños ≤7d.'
  from studios s
  where s.deleted_at is null
    and not exists (select 1 from notifications n where n.studio_id=s.id and n.type='daily_digest' and n.created_at::date=current_date)
    and (
      exists (select 1 from projects p where p.studio_id=s.id and p.deleted_at is null and p.event_date=current_date)
      or exists (select 1 from invoices i where i.studio_id=s.id and i.deleted_at is null and i.status='overdue')
      or exists (select 1 from booking_requests br where br.studio_id=s.id and br.status='pending_review')
      or exists (select 1 from client_deliveries cd where cd.studio_id=s.id and cd.deleted_at is null and cd.status<>'entregada' and cd.birthday between current_date and current_date+7)
    );
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  return v_total;
end;
$function$

;

-- Cron a las 7 AM RD (UTC-4) = 11:00 UTC.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'studio-automations-daily'),
  schedule := '0 11 * * *'
);

-- Backfill: alinear due_date al día del evento en facturas de sesión pendientes.
UPDATE public.invoices i
   SET due_date = p.event_date, updated_at = now()
  FROM public.projects p
 WHERE p.id = i.project_id AND i.deleted_at IS NULL AND p.event_date IS NOT NULL
   AND i.due_date IS DISTINCT FROM p.event_date
   AND i.status IN ('sent','viewed','pending','partially_paid','overdue');
