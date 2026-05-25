# F6 — Guía operacional del módulo Mail (deploy + Edge Function + Storage)

Checklist para activar el módulo Mail en producción tras mergear el PR #11.

---

## 1. Aplicar migration en Supabase

```bash
cd studioflow
npx supabase migration up --linked
# o desde Supabase SQL Editor: copy/paste supabase/migrations/20260520000600_mail_init.sql
```

Verificar:
```sql
SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'mail_%';
-- esperado: 7

SELECT count(*) FROM pg_type WHERE typname LIKE 'mail_%';
-- esperado: 4

SELECT proname FROM pg_proc WHERE proname='mail_recompute_thread_counters';
-- esperado: 1 row
```

---

## 2. Crear Storage bucket `mail-attachments`

Desde el Supabase Dashboard → Storage → New bucket:
- Name: `mail-attachments`
- Public: **NO** (privado, signed URLs)
- File size limit: 25 MB
- Allowed MIME types: vacío (todos permitidos — los emails contienen tipos variados)

RLS policy en `storage.objects` para el bucket:
```sql
-- Solo miembros del studio pueden leer/escribir sus attachments
CREATE POLICY "mail_attachments_studio_isolation"
  ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'mail-attachments'
    AND public.is_studio_member((storage.foldername(name))[1]::uuid)
  )
  WITH CHECK (
    bucket_id = 'mail-attachments'
    AND public.is_studio_member((storage.foldername(name))[1]::uuid)
  );
```

> El storage_key tiene formato `<studio_id>/<account_id>/<message_id>/<filename>`.
> El primer segmento (studio_id) determina el acceso vía RLS.

---

## 3. Generar tipos Supabase

```bash
cd studioflow
npx supabase gen types typescript --linked > types/supabase.ts
```

Después de esto, los services pueden migrar de `untypedServer()/untypedService()`
al cliente tipado normal (`createSupabaseServerClient()`). Pero no es urgente —
el untyped helper funciona en runtime.

---

## 4. Configurar env vars en producción

En el VPS (`/home/studioflow/htdocs/my.abbypixel.com/.env.production`):

```bash
MAIL_SYNC_TOKEN=<generar-random-32-bytes>
# Ejemplo: openssl rand -hex 32
```

Reload pm2:
```bash
ssh studioflow@<ip-vps>
pm2 restart studioflow --update-env
```

Test del endpoint:
```bash
TOKEN=<el-mismo-token>
curl -H "Authorization: Bearer $TOKEN" https://my.abbypixel.com/api/mail/sync
# Esperado: { "ok": true, "summary": { "total": 0, ... } } si no hay cuentas
```

---

## 5. Deploy Edge Function (cron orchestrator)

```bash
cd studioflow
supabase functions deploy mail-sync-cron --no-verify-jwt
```

Configurar secrets de la Edge Function:
```bash
supabase secrets set MAIL_SYNC_URL=https://my.abbypixel.com/api/mail/sync
supabase secrets set MAIL_SYNC_TOKEN=<el-mismo-de-la-app>
```

Test manual del cron:
```bash
curl -X POST https://<project>.supabase.co/functions/v1/mail-sync-cron \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
# Esperado: { "ok": true, "durationMs": 234, "summary": {...} }
```

---

## 6. Configurar pg_cron (sync c/5min)

Habilitar extensiones (si no están):
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

Schedule el cron:
```sql
SELECT cron.schedule(
  'mail-imap-sync-every-5min',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://<project>.supabase.co/functions/v1/mail-sync-cron',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <supabase_anon_key>',
        'Content-Type', 'application/json'
      )
    );
  $$
);
```

Verificar:
```sql
SELECT * FROM cron.job WHERE jobname = 'mail-imap-sync-every-5min';
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
```

---

## 7. Smoke test end-to-end

### 7.1. Configurar cuenta Mailcow desde la app

1. Login en `my.abbypixel.com`
2. Sidebar → Configuración → Fiscal RD / Mail (TODO link en sidebar)
3. O directo: `https://my.abbypixel.com/settings/mail`
4. Click "Conectar nueva cuenta"
5. Completar datos:
   - Email: `info@miestudio.com`
   - IMAP host: `mail.miestudio.com` puerto 993 SSL/TLS
   - Password
6. Click "Probar conexión" → debe mostrar verde con folders detectados
7. Click "Guardar cuenta" → auto-test + persist

### 7.2. Forzar primer sync manual

```bash
# Body con studioId + accountId
curl -X POST https://my.abbypixel.com/api/mail/sync \
  -H "Authorization: Bearer $MAIL_SYNC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"studioId":"<uuid>","accountId":"<uuid>"}'
```

Esperado:
```json
{
  "ok": true,
  "stats": {
    "messagesNew": 47,
    "messagesSkipped": 0,
    "threadsTouched": 12,
    "attachmentsUploaded": 3,
    "errors": [],
    "durationMs": 4231
  }
}
```

### 7.3. Verificar UI

- `/mail/inbox` debe mostrar threads sincronizados
- Click en un thread → detalle con messages cronológicos
- Si hay attachment, debe descargarse de Storage (signed URL — TODO V2)
- Reply form al final del thread

### 7.4. Verificar dedup en próximo sync

Esperar 5 minutos (próximo cron) → verificar que `messagesNew = 0` y
`messagesSkipped = N` (los UNIQUE catch del schema previenen duplicados).

---

## 8. Outbound smoke (envío)

1. `/mail/compose`
2. To: `noreply@anthropic.com` (rebote esperado pero valida flow)
3. Subject: "Test envío"
4. Body: cualquier texto
5. Click "Enviar"
6. Verificar:
   - Toast success con threadId
   - Redirect al thread del mensaje
   - DB: `SELECT * FROM mail_messages WHERE direction='outbound' ORDER BY created_at DESC LIMIT 1`
     → status='sent', message_id presente, rejected[] tiene `noreply@anthropic.com`

---

## 9. Monitoring

Métricas recomendadas a vigilar:
- `cron.job_run_details` última fila — si status='failed', investigar
- Logs de `mail-sync-cron` Edge Function en Supabase Dashboard
- Logs pm2 `studioflow` para `[mail-imap-sync]` o `[Stripe→Finance]`
- Tabla `mail_accounts.sync_status='error'` con `last_error` populated
- Tabla `mail_messages` count por día (debe crecer si llegan emails)
- Storage bucket `mail-attachments` size growth (alertar si >10GB)

Alertas básicas (TODO V2):
- Sync no corrió en >15 min
- >50% de cuentas en sync_status='error'
- Storage bucket >80% full

---

## 10. Troubleshooting

### Sync devuelve 401 Unauthorized
- Verificar `MAIL_SYNC_TOKEN` matches entre Edge Function secret y app env

### Cuenta queda en sync_status='syncing' indefinidamente
- Lock leak. Reset manual:
  ```sql
  UPDATE mail_accounts
  SET sync_status = 'ok'
  WHERE sync_status = 'syncing'
    AND last_synced_at < NOW() - interval '15 min';
  ```

### IMAP authentication failed
- Verificar credenciales con `testMailcowConnection` desde la app
- Mailcow podría requerir "App Password" en lugar de password principal
- Si tiene 2FA, generar app password en Mailcow UI

### Attachments no se suben
- Verificar bucket `mail-attachments` existe en Storage
- Verificar RLS policy permite INSERT
- Check tamaño del attachment vs límite del bucket (25MB)

### HTML body no se renderiza correctamente
- Verificar `sanitize-html` está en deps del repo
- `lib/mail-html.ts` con `sanitizeEmailHtml` aplicado en thread detail
- Si el email tiene CSS muy custom, expandir `allowedStyles` whitelist

---

## 11. Decommission del módulo (rollback)

Si necesitas deshabilitar el sync temporalmente:

```sql
-- Pausar el cron
SELECT cron.unschedule('mail-imap-sync-every-5min');

-- O pausar todas las cuentas
UPDATE mail_accounts SET sync_status = 'disabled' WHERE is_active = true;
```

Reactivar:
```sql
-- Re-schedule
SELECT cron.schedule(...);
-- Re-enable accounts
UPDATE mail_accounts SET sync_status = 'ok' WHERE sync_status = 'disabled';
```

Full removal del módulo (irreversible):
```sql
DROP TABLE mail_message_labels, mail_labels, mail_attachments,
  mail_messages, mail_threads, mail_folders, mail_accounts CASCADE;
DROP TYPE mail_direction, mail_message_status, mail_folder_kind, mail_sync_status;
```

---

## Estado actual del módulo F6 al merge

✓ Schema completo (7 tablas + 4 enums + RPC)
✓ `lib/mailcow.ts` IMAP + SMTP wrappers
✓ Services: mail-account, mail-imap-sync, mail-send, mail-thread
✓ Server Actions: markRead, markThreadRead, linkThread, archive, sendMail
✓ UI: /settings/mail + /mail/inbox + /mail/threads/[id] + /mail/compose
✓ Route Handler /api/mail/sync (cron entry)
✓ HTML body safe render con sanitize-html
✓ Edge Function mail-sync-cron (este documento)

Pendientes V2:
- Signed URLs auto en attachments (cuando bucket es privado)
- Search full-text en inbox (gin index ya existe)
- Drafts auto-save en compose
- Bandeja "Enviados" / "Borradores" como folders separados
- Bounce handler webhook (Mailcow DSN)
- Pgsodium encrypt_aead real para passwords (actualmente prefix `v1:`)
- IMAP IDLE en lugar de polling (requiere persistent connection — solo
  posible en pm2 worker dedicado, no Edge Function)
