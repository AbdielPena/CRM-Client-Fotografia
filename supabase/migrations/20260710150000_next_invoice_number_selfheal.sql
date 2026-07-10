-- FIX: next_invoice_number devolvía un número ya usado cuando el contador
-- (invoice_sequences.current_value) quedaba DETRÁS del máximo real de facturas
-- (por facturas creadas sin pasar por esta función: migración, espejo de
-- Facturación, etc.). Eso violaba la unique (studio_id, invoice_number) y hacía
-- fallar generate_booking_invoice → los contratos firmados no generaban factura.
--
-- Ahora la función es AUTO-SANABLE: tras incrementar el contador, si el máximo
-- real (mismo prefijo+año) es >= al valor calculado, salta por encima y persiste
-- el contador. Así nunca devuelve un número ya usado.
create or replace function public.next_invoice_number(
  p_studio_id uuid,
  p_prefix text default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_next integer;
  v_year text := to_char(now(), 'YYYY');
  v_prefix text := coalesce(p_prefix, 'INV');
  v_max integer;
begin
  insert into invoice_sequences (studio_id, current_value)
  values (p_studio_id, 1)
  on conflict (studio_id) do update
    set current_value = invoice_sequences.current_value + 1,
        updated_at = now()
  returning current_value into v_next;

  -- Máximo real de facturas del mismo prefijo + año.
  select coalesce(max((regexp_replace(invoice_number, '^.*-(\d+)$', '\1'))::int), 0)
    into v_max
    from invoices
    where studio_id = p_studio_id
      and invoice_number like v_prefix || '-' || v_year || '-%';

  if v_max >= v_next then
    v_next := v_max + 1;
    update invoice_sequences
      set current_value = v_next, updated_at = now()
      where studio_id = p_studio_id;
  end if;

  return v_prefix || '-' || v_year || '-' || lpad(v_next::text, 5, '0');
end;
$function$;
