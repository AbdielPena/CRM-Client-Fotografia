-- Poner al día a quien ya envió su selección y se quedó atrás en el tablero.
--
-- `submitClientSelection` recalculaba la fecha de entrega pero NUNCA movía el
-- estado de la sesión: la clienta enviaba su selección y el tablero seguía
-- diciendo "Esperando selección" (7 casos reales, uno desde el 27 de julio).
-- El código ya lo hace; esto arregla las que quedaron colgadas.
--
-- Solo mueve hacia ADELANTE: si la sesión ya está más avanzada (entregada, en
-- impresión, completada…), no se toca.

update public.projects pr
   set status = destino.label,
       updated_at = now()
  from public.project_statuses destino
 where destino.studio_id = pr.studio_id
   and destino.auto_intent = 'edicion'
   and pr.deleted_at is null
   and pr.cancelled_at is null
   and pr.finalized_at is null
   -- Su columna actual está más atrás que "En edición". Un estado que no exista
   -- en el tablero cuenta como -1 (más atrás que todo).
   and coalesce(
         (select ps2.position
            from public.project_statuses ps2
           where ps2.studio_id = pr.studio_id
             and ps2.label = pr.status),
         -1) < destino.position
   -- Y su cliente ya envió al menos una selección.
   and exists (
     select 1
       from public.galleries g
      where g.project_id = pr.id
        and g.deleted_at is null
        and g.selection_submitted = true
   );
