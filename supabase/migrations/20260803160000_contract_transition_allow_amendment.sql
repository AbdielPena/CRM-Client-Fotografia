-- Un contrato firmado puede volver a "pendiente de firma" SOLO si se registró
-- una modificación formal.
--
-- El disparador existía para que nadie "des-firmara" un contrato por accidente,
-- y esa protección se mantiene: la única puerta nueva es la del flujo de
-- modificación, que antes de tocar el estado archiva la firma anterior en
-- `contract_amendments`. Sin esa fila, `signed → sent` sigue prohibido.

create or replace function public.enforce_contract_transition()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
DECLARE
  allowed text[];
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    -- Cliente puede firmar directo desde cualquier estado intermedio
    WHEN 'draft'     THEN allowed := ARRAY['sent','viewed','signed','cancelled','voided'];
    WHEN 'sent'      THEN allowed := ARRAY['viewed','signed','expired','cancelled','voided'];
    WHEN 'viewed'    THEN allowed := ARRAY['signed','expired','voided'];
    WHEN 'signed'    THEN allowed := ARRAY['voided'];
    -- Un contrato vencido se puede reabrir si se modificó (se valida abajo).
    WHEN 'expired'   THEN allowed := ARRAY[]::text[];
    WHEN 'cancelled' THEN allowed := ARRAY[]::text[];
    WHEN 'voided'    THEN allowed := ARRAY[]::text[];
    ELSE allowed := ARRAY[]::text[];
  END CASE;

  -- Puerta de la modificación: firmado/vencido → pendiente de firma, siempre
  -- que exista la constancia de qué se cambió y qué firma quedó anulada.
  IF NEW.status::text = 'sent'
     AND OLD.status::text IN ('signed', 'expired', 'viewed')
     AND EXISTS (
       SELECT 1 FROM public.contract_amendments ca WHERE ca.contract_id = NEW.id
     )
  THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.status::text = ANY(allowed)) THEN
    RAISE EXCEPTION 'transición ilegal de contrato: % → % (permitidas: %)',
      OLD.status, NEW.status, allowed
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

comment on function public.enforce_contract_transition() is
  'Impide des-firmar un contrato por accidente. Excepción: volver a "sent" cuando existe una fila en contract_amendments (modificación formal, con la firma anterior archivada).';
