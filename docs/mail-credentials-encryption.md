# Mail credentials — Encriptación con pgsodium

Reemplaza el storage en texto plano (prefix `v1:`) con cifrado AEAD usando
pgsodium, manteniendo backward compatibility.

## Arquitectura

```
mail_accounts.imap_password_secret_id   ──┐
                                          │  v1:<plaintext>     ← legacy
                                          │  v2:<base64(nonce||ct||tag)>  ← pgsodium AEAD
                                          │
                                          ↓
                            public.mail_decrypt_password(ct, studio_id)
                                          ↓
                            mail_crypto.decrypt_secret(ct, studio_id)
                                          ↓
                            pgsodium.crypto_aead_det_decrypt
                                  ↑
                            key = mail_credentials_master (vault)
                            AAD = studio_id (binding)
```

## Por qué pgsodium AEAD determinístico

- **Deterministic**: el mismo plaintext + key produce el mismo ciphertext. Eso permite WHERE imap_password_secret_id = '<ct>' si alguna vez se necesita. No necesario en el flow actual pero es opcional buena propiedad.
- **AEAD**: incluye authenticated additional data (AAD) — usamos `studio_id` como AAD. Si un atacante intentara descifrar una credencial de Studio A con el contexto de Studio B, el decrypt falla. Aísla blast radius.
- **Key derivation**: la key maestra vive en `pgsodium.valid_key` (cifrado at-rest por Supabase con su master key). El service role NO ve la key directamente.

## Setup

1. Aplicar migration `20260520001100_mail_pgsodium_encryption.sql`
2. La función `mail_crypto.get_master_key_id()` crea la key maestra
   automáticamente la primera vez. Es idempotente.
3. Re-generar tipos:
   ```bash
   npx supabase gen types typescript --linked > types/supabase.ts
   ```
4. Ejecutar la migración de credenciales existentes (v1 → v2):
   ```sql
   SELECT * FROM public.mail_migrate_v1_to_v2();
   -- Devuelve tabla con account_id + migrated bool + error
   ```

## Backward compatibility

El service `mail-account.service.ts` reconoce ambos formatos:
- `v1:` (legacy) → split slice(3)
- `v2:` (pgsodium) → RPC `mail_decrypt_password`

Si la RPC falla (migration no aplicada), el encrypt fallback es `v1:` para
mantener funcionalidad sin cifrado. Una vez que la migration aplica, las
nuevas cuentas se guardan como `v2:` automáticamente.

## Seguridad operacional

- **RPC GRANTs**: las funciones tienen `SECURITY DEFINER` y se revocan de
  `public`, `anon`, `authenticated`. Solo `service_role` puede llamar.
- **Cliente browser nunca ve credentials**: el flujo decrypt ocurre solo en
  Server Components / Server Actions con service role.
- **Audit**: `mail_account.created/updated` se loguea en `activity_log` con
  los cambios pero NUNCA con el password.
- **Rotación de key**: para rotar la master key sin downtime:
  1. Crear nueva key: `pgsodium.create_key(name => 'mail_credentials_master_v2')`
  2. Renombrar viejo: `UPDATE pgsodium.key SET name = 'mail_credentials_master_v1_archive' WHERE name = 'mail_credentials_master'`
  3. Renombrar nuevo: `UPDATE pgsodium.key SET name = 'mail_credentials_master' WHERE name = 'mail_credentials_master_v2'`
  4. Re-ejecutar `mail_migrate_v1_to_v2()` adaptado (versión `v3:`)
  - No implementado en V1; V2 si hay incidente de seguridad

## Verificación

```sql
-- Cuántas cuentas todavía en v1:
SELECT count(*) FROM mail_accounts
WHERE imap_password_secret_id LIKE 'v1:%' OR smtp_password_secret_id LIKE 'v1:%';

-- Cuántas en v2:
SELECT count(*) FROM mail_accounts
WHERE imap_password_secret_id LIKE 'v2:%' AND smtp_password_secret_id LIKE 'v2:%';

-- Forzar re-encrypt de una cuenta específica (sin RPC):
UPDATE mail_accounts
SET imap_password_secret_id = mail_encrypt_password(
  mail_decrypt_password(imap_password_secret_id, studio_id),
  studio_id
)
WHERE id = '<account_id>';
```

## Limitaciones conocidas

- Si pgsodium no está disponible (Supabase tier free no lo incluye), la
  migration falla en `CREATE EXTENSION`. Solución: pedir upgrade a tier
  con pgsodium o mantener `v1:` con TLS-only en redis.
- La key maestra está vinculada al project Supabase. Si se hace fork/clone
  del project, las credentials cifradas no se descifran en el target.
  Para migrar entre projects: descifrar todo a `v1:`, copiar, re-cifrar.
- Cada decrypt es un round-trip a la DB. Para alto throughput (cron sync
  de 100 cuentas), cachear el decrypt en memoria por TTL corto (5 min).
  No implementado en V1 — performance OK con <50 cuentas activas.
