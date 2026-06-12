-- Toggles del chatbot de WhatsApp:
--   handoff_notify_whatsapp → al pasar a humano, avisar también por WhatsApp
--                             al número principal del estudio (transaccional).
--   mirror_emails           → enviar también por WhatsApp (plantilla equivalente)
--                             los avisos que van por email al cliente.
alter table public.chatflow_settings
  add column if not exists handoff_notify_whatsapp boolean not null default false,
  add column if not exists mirror_emails boolean not null default false;
