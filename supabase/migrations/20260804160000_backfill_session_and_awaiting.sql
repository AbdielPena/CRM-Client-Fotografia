-- Poner al día los pasos 4 y 5 del flujo, que tampoco tenían quien los moviera.
--
--   4. La sesión ya ocurrió           → "Sesión realizada"
--   5. Le mandaste la galería a elegir → "Esperando selección"
--
-- "Ocurrió de verdad" NO es solo que pasara la fecha: hace falta **pago o
-- galería**. Una sesión agendada que nunca se hizo no debe arrastrar el
-- pipeline (misma regla que `sessionHappened` en workflow.service.ts).
--
-- Solo mueve hacia ADELANTE. Se aplica primero el paso 4 y luego el 5, para que
-- quien ya tenga galería publicada termine en el sitio correcto.

-- ── Paso 4 · Sesión realizada ───────────────────────────────────────────────
update public.projects pr
   set status = destino.label, updated_at = now()
  from public.project_statuses destino
 where destino.studio_id = pr.studio_id
   and destino.auto_intent = 'sesion_realizada'
   and pr.deleted_at is null
   and pr.cancelled_at is null
   and pr.finalized_at is null
   and pr.event_date is not null
   and pr.event_date < current_date
   and coalesce(
         (select ps2.position from public.project_statuses ps2
           where ps2.studio_id = pr.studio_id and ps2.label = pr.status),
         -1) < destino.position
   -- Pago confirmado…
   and (
     exists (
       select 1
         from public.payments pay
         join public.invoices i on i.id = pay.invoice_id
        where i.project_id = pr.id
          and pay.status = 'completed'
          and pay.deleted_at is null
          and i.deleted_at is null
     )
     -- …o galería con fotos (cobró en efectivo, o viene migrado).
     or exists (
       select 1 from public.galleries g
        where g.project_id = pr.id and g.deleted_at is null
     )
   );

-- ── Paso 5 · Esperando selección ────────────────────────────────────────────
update public.projects pr
   set status = destino.label, updated_at = now()
  from public.project_statuses destino
 where destino.studio_id = pr.studio_id
   and destino.auto_intent = 'esperando_seleccion'
   and pr.deleted_at is null
   and pr.cancelled_at is null
   and pr.finalized_at is null
   and coalesce(
         (select ps2.position from public.project_statuses ps2
           where ps2.studio_id = pr.studio_id and ps2.label = pr.status),
         -1) < destino.position
   -- Tiene una galería de SELECCIÓN ya publicada (o sea, el cliente la tiene).
   and exists (
     select 1 from public.galleries g
      where g.project_id = pr.id
        and g.deleted_at is null
        and coalesce(g.gallery_type, 'selection') <> 'final_delivery'
        and g.status = 'published'
   );
