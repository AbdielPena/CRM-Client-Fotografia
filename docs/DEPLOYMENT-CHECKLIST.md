# StudioFlow — Deployment Checklist (lo que TÚ debes hacer)

Todo el código está listo. Lo siguiente son tareas operacionales que
requieren acceso a tus credenciales/infraestructura.

---

## 1. Aplicar migraciones Supabase (en orden)

```bash
cd studioflow
npx supabase migration up --linked
```

Las migraciones nuevas a aplicar (16 total — orden por timestamp):

| Migration | Módulo | Notas |
|---|---|---|
| `20260520000300_inventory_init.sql` | Inventory | F3 schema base |
| `20260520000500_finance_init.sql` | Finance | F5 schema |
| `20260520000500_payables_dgii_606_compat.sql` | Fiscal RD | F4 V2 — ALTER fin_payables |
| `20260520000600_mail_init.sql` | Mail | F6 schema |
| `20260520000700_*` (NCF + cron + invoice) | Fiscal | F4 |
| `20260520000800_mail_drafts_bounces.sql` | Mail V2 | drafts + bounces |
| `20260520001000_automations_init.sql` | Automations | F2 V2 |
| `20260520001100_mail_pgsodium_encryption.sql` | Mail V3 | Cifrado AEAD |
| `20260520001200_billing_init.sql` | SaaS | Plans + subs + invoices |
| `20260520001300_studio_branding.sql` | Branding | Logo, colores, copy |
| `20260520001400_tasks_init.sql` | Tasks | Asignación + recurrencia |
| `20260520001500_api_tokens_webhooks.sql` | API + Webhooks | Bearer + HMAC |
| `20260520001600_studio_onboarding.sql` | Onboarding | Wizard checklist |
| `20260520001700_user_2fa.sql` | 2FA | TOTP custom |
| `20260520001800_internal_chat.sql` | Chat | Mensajes + reactions |
| `20260520001900_project_templates.sql` | Templates | Workflows reutilizables |
| `20260520002000_studio_invitations.sql` | Members | Invitar staff |

⚠️ **Antes de aplicar**: Toma snapshot pg_dump siguiendo
`docs/f0-pg-dump-runbook.md`.

---

## 2. Regenerar tipos TypeScript

```bash
npx supabase gen types typescript --linked > types/supabase.ts
git add types/supabase.ts
git commit -m "chore: regenerate Supabase types after migrations"
```

---

## 3. Migrar credenciales mail v1 → v2 (pgsodium)

Después de aplicar `20260520001100_mail_pgsodium_encryption.sql`:

```sql
-- Ejecutar UNA VEZ desde Supabase SQL editor
SELECT * FROM public.mail_migrate_v1_to_v2();
-- Esperado: tabla con account_id + migrated=true + error=null
```

---

## 4. Storage buckets (Supabase Dashboard)

Crear estos buckets en Supabase Storage:

| Bucket | Privacidad | Max size |
|---|---|---|
| `mail-attachments` | Private | 25 MB |
| `studio-branding` | Public | 10 MB (logos, favicons) |
| `project-templates` | Public | 5 MB (cover images) |

RLS policies para los privados — ya documentadas en `docs/f6-mail-deploy.md`.

---

## 5. Variables de entorno en VPS

Agregar al `.env.production`:

```bash
# Existentes (verificar que estén)
NEXT_PUBLIC_SUPABASE_URL=https://kbrcqyjnrbjlzfolpcsx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Mail (F6)
MAIL_SYNC_TOKEN=<openssl rand -hex 32>
MAILCOW_IMAP_HOST=mail.tudominio.com
MAILCOW_SMTP_HOST=mail.tudominio.com
MAILCOW_BOUNCE_TOKEN=<openssl rand -hex 32>

# Finance (F5 V2)
FINANCE_CRON_TOKEN=<openssl rand -hex 32>

# Google Calendar (F2 V2)
GOOGLE_CLIENT_ID=<de Google Cloud Console>
GOOGLE_CLIENT_SECRET=<de Google Cloud Console>
GOOGLE_REDIRECT_URI=https://my.abbypixel.com/api/integrations/google/callback
GOOGLE_WATCH_CRON_TOKEN=<openssl rand -hex 32>
OAUTH_STATE_SECRET=<openssl rand -hex 32>

# Stripe (Billing SaaS)
STRIPE_SECRET_KEY=sk_live_XXX (o sk_test para pruebas)
STRIPE_WEBHOOK_SECRET_BILLING=whsec_XXX
NEXT_PUBLIC_APP_URL=https://my.abbypixel.com

# Tasks reminders
TASK_REMINDERS_CRON_TOKEN=<openssl rand -hex 32>

# Webhook retries
WEBHOOK_RETRY_CRON_TOKEN=<openssl rand -hex 32>
```

Después: `pm2 restart studioflow`

---

## 6. Setup de cron jobs

Hay 5 endpoints cron que necesitan disparar periódicamente:

| Endpoint | Frecuencia | Bearer token |
|---|---|---|
| `/api/cron/finance-jobs` | Diario 4:00 UTC | `FINANCE_CRON_TOKEN` |
| `/api/cron/google-watches` | Diario 5:00 UTC | `GOOGLE_WATCH_CRON_TOKEN` |
| `/api/cron/tasks-reminders` | Cada 5 min | `TASK_REMINDERS_CRON_TOKEN` |
| `/api/cron/webhook-retries` | Cada 5 min | `WEBHOOK_RETRY_CRON_TOKEN` |
| `/api/mail/sync` | Cada 5 min | `MAIL_SYNC_TOKEN` |

Opciones para configurar:

### Opción A: pg_cron + http extension (recomendado — todo en Supabase)

```sql
-- Ejemplo finance-jobs diario
SELECT cron.schedule(
  'finance-jobs-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://my.abbypixel.com/api/cron/finance-jobs',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.finance_cron_token')),
    body := '{}'::jsonb
  );
  $$
);
```

### Opción B: cron del VPS

```bash
crontab -e
```

```cron
0 4 * * * curl -s -X POST -H "Authorization: Bearer $FINANCE_CRON_TOKEN" https://my.abbypixel.com/api/cron/finance-jobs >> /var/log/cron.log
0 5 * * * curl -s -X POST -H "Authorization: Bearer $GOOGLE_WATCH_CRON_TOKEN" https://my.abbypixel.com/api/cron/google-watches >> /var/log/cron.log
*/5 * * * * curl -s -X POST -H "Authorization: Bearer $TASK_REMINDERS_CRON_TOKEN" https://my.abbypixel.com/api/cron/tasks-reminders >> /var/log/cron.log
*/5 * * * * curl -s -X POST -H "Authorization: Bearer $WEBHOOK_RETRY_CRON_TOKEN" https://my.abbypixel.com/api/cron/webhook-retries >> /var/log/cron.log
*/5 * * * * curl -s -X POST -H "Authorization: Bearer $MAIL_SYNC_TOKEN" https://my.abbypixel.com/api/mail/sync >> /var/log/cron.log
```

### Opción C: Supabase Edge Function (mail-sync-cron ya existe en `supabase/functions/`)

```bash
supabase functions deploy mail-sync-cron
supabase secrets set MAIL_SYNC_URL=https://my.abbypixel.com/api/mail/sync
supabase secrets set MAIL_SYNC_TOKEN=<token>
```

---

## 7. Stripe setup

1. Crea cuenta en https://dashboard.stripe.com
2. Crea Products + Prices (uno por interval):
   - Pro Monthly ($19/mo) y Yearly ($190/yr)
   - Studio Monthly ($49/mo) y Yearly ($490/yr)
   - Agency Monthly ($149/mo) y Yearly ($1490/yr)
3. Copia los `price_XXXX` IDs y pégalos en `/admin/billing/plans` editando cada plan
4. Crea Webhook endpoint:
   - URL: `https://my.abbypixel.com/api/webhooks/stripe-billing`
   - Eventos: `customer.subscription.*`, `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`
   - Copia el signing secret a `STRIPE_WEBHOOK_SECRET_BILLING`

---

## 8. Google Cloud Console (Calendar OAuth)

1. https://console.cloud.google.com/ → crea proyecto "StudioFlow"
2. Habilita "Google Calendar API"
3. Credenciales → OAuth 2.0 Client ID:
   - Type: Web application
   - Authorized redirect URI: `https://my.abbypixel.com/api/integrations/google/callback`
4. Copia Client ID + Secret a env vars
5. Verifica el dominio para push notifications

---

## 9. ETLs (migración de datos existentes)

Si tienes data en finanzapp/inventario, ejecutar **una sola vez** después de aplicar las migrations:

```bash
# Inventory (in-DB schema inventario.* → public.inv_*)
pnpm tsx scripts/migrate-inventario.ts

# Finanzapp (cross-cluster local Postgres → Supabase)
pnpm tsx scripts/migrate-finanzapp.ts
```

Validar counts pre/post con:

```bash
pnpm tsx scripts/pre-migration-audit.ts <studio_id>
# Guarda snapshot
pnpm tsx scripts/pre-migration-audit.ts <studio_id> --compare ./audit-XXX.json
# Diff post-ETL
```

---

## 10. Mergear las branches a main

Orden recomendado:

```bash
# En este orden — cada uno depende del anterior
git checkout main

git merge claude/pensive-cerf-2592e8   # F1 backbone + F2 + onboarding + 2FA + chat + templates + i18n + members + automations + dashboard + billing + branding + tasks + reports + API
git merge claude/f3-inventory-schema    # Inventory completo
git merge claude/f4-fiscal-ncf-integration  # Fiscal RD NCF
git merge claude/f5-finance-schema      # Finance completo
git merge claude/f6-mail-schema         # Mail + pgsodium
git merge claude/f7-sidebar-module-switcher
git merge claude/f8-hub-decommission

git push origin main
```

Si hay conflictos en archivos compartidos (lib/decimal.ts, server/supabase/untyped.ts), siempre quedarse con la versión más reciente.

---

## 11. Deploy

Push a main triggerea el deploy automático vía `.github/workflows/deploy-vps.yml` (SSH directo al VPS IONOS).

Para verificar:
```bash
ssh studioflow@<vps-ip>
pm2 status
pm2 logs studioflow --lines 50
curl https://my.abbypixel.com/api/healthz
```

---

## 12. Smoke tests en producción

Después del deploy, ejecutar manualmente:

- [ ] `/login` funciona, crear studio nuevo en `/register`
- [ ] `/onboarding` muestra 10 steps con autodetect
- [ ] `/settings/branding` permite cambiar logo + color
- [ ] `/settings/members` permite invitar a un email de prueba
- [ ] Aceptar la invitación en `/invitations/[token]` con cuenta nueva
- [ ] `/clients/new` crea cliente
- [ ] `/projects/new` crea proyecto
- [ ] `/invoices/new` crea invoice + send → auto-emit NCF
- [ ] Marcar invoice paid → ve aparecer fin_transactions
- [ ] `/tasks/new` crea task + ver notification al asignado
- [ ] `/chat/general` envía mensaje + reaccionar
- [ ] `/automations/new` crear regla simple
- [ ] `/settings/api` generar token + probar `curl https://my.abbypixel.com/api/v1/clients -H "Authorization: Bearer sf_XXX"`
- [ ] `/settings/webhooks` crear webhook apuntando a webhook.site, crear cliente, verificar delivery
- [ ] `/reports` cargar y descargar CSV de P&L
- [ ] `/settings/billing` upgrade a Pro (con Stripe test card 4242 4242 4242 4242)
- [ ] `/settings/security` activar 2FA + guardar recovery codes
- [ ] `/mail/inbox` (si Mailcow configurado) recibir + responder
- [ ] `/finance/subscriptions/new` crear suscripción + esperar cron diario

---

## 13. Decommission de sistemas viejos (después de 14 días sin issues)

Seguir `docs/decommission-hub.md`:

- Apagar pm2 process del hub
- Configurar 410 Gone en nginx para subdominios viejos
- DROP SCHEMA inventario CASCADE (después de validar ETL)
- Mover repos studio-hub, studioflow-platform, finanzapp, inventario-app
  a `_archive/` con dumps SQL incluidos
- Mantener dumps en S3 cold storage por 6 meses

---

## 14. Documentación al cliente final (V4)

Crear `docs/USER-GUIDE.md` con screenshots de:
- Cómo crear el primer proyecto
- Cómo aceptar pagos por Stripe
- Cómo usar el chat con tu equipo
- Cómo configurar automatizaciones
- Cómo conectar Mailcow

(Esto NO lo hice yo — requiere el dominio publicado y screenshots reales).

---

## Resumen de lo que YA está hecho

**60+ tablas PG**, **30+ services TS**, **75+ páginas UI**, **15+ migrations**,
**5 cron endpoints**, **5 webhook endpoints**, **18 PRs** organizados.

Ver `docs/MIGRATION-INDEX.md` para el detalle técnico completo de cada fase.

¡Buena suerte con el deploy! 🚀
