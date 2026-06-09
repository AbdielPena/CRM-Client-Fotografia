-- WhatsApp Cloud API (Meta) como servicio de integración por estudio.
-- Las credenciales (phone_number_id, access_token, business_account_id) se
-- guardan en studio_integrations.config (jsonb), igual que Drive/Calendar.
alter type integration_service add value if not exists 'whatsapp';
