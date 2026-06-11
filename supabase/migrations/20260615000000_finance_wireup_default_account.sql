-- Wire-up CRM → Finanzas: cuenta default por studio
--
-- Motivo: hoy cuando se paga una factura (Stripe o manual), se intenta crear
-- un fin_transactions tipo='ingreso' pero queda con cuenta_id=null, así que
-- el balance de las cuentas en /finance/accounts no se mueve. Y peor, en el
-- camino manual ni siquiera se crea el fin_transactions.
--
-- Esta migración agrega `default_finance_account_id` a `studios` para que el
-- wire-up pueda auto-asignar la cuenta destino. El selector en el modal de
-- "Registrar pago" la preselecciona y el usuario puede cambiarla por pago.
-- Si la cuenta default se borra, el FK cae a NULL (no rompe el studio).

alter table public.studios
  add column if not exists default_finance_account_id uuid
  references public.fin_accounts(id) on delete set null;

comment on column public.studios.default_finance_account_id is
  'Cuenta de Finanzas a la que se asigna por defecto cualquier pago entrante (Stripe o manual). Editable desde /settings. El selector del modal de pago la preselecciona.';
