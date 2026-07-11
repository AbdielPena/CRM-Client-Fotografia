-- Deliverability de correo:
--  - clients.email_token: token estable por cliente para el link de baja de 1
--    clic (RFC 8058 · cabecera List-Unsubscribe / List-Unsubscribe-Post). Sube
--    la reputación del dominio: la gente se da de baja en vez de marcar spam.
--  - clients.email_opted_out_at: baja de correos NO esenciales (marketing /
--    engagement). Los transaccionales (factura, contrato, galería, entrega,
--    impresiones, recordatorios de pago) NO se ven afectados: siempre se envían.
create extension if not exists pgcrypto;

alter table clients add column if not exists email_token uuid;
alter table clients add column if not exists email_opted_out_at timestamptz;

-- Backfill de tokens para clientes existentes.
update clients set email_token = gen_random_uuid() where email_token is null;

-- Nuevos clientes obtienen token automáticamente.
alter table clients alter column email_token set default gen_random_uuid();

create unique index if not exists clients_email_token_key on clients (email_token);
