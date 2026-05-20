# F0 — Runbook de Snapshots pg_dump (pre-migración)

## Objetivo

Antes de aplicar migraciones destructivas o ETLs grandes (F3 Inventory, F5
Finance ETL cross-cluster), tomar snapshots completos de:

1. **Supabase project `kbrcqyjnrbjlzfolpcsx`** — DB del monolito (studioflow + inventario.* legacy)
2. **Postgres local finanzapp** — `postgres://postgres:postgres@localhost:5432/finanzapp`

Los dumps se guardan en `/srv/backups/studioflow/<YYYY-MM-DD>-pre-fX/` con permisos
`600` para el user `studioflow` en el VPS, y se replican (sincrónicamente) a
`/var/data/local-backups/` en la máquina del desarrollador.

---

## Pre-requisitos

- Acceso SSH a VPS IONOS como user `studioflow`
- Credenciales válidas del Supabase project (en `.env.production` del VPS)
- `pg_dump` versión >= 15 instalado localmente y en el VPS (`postgresql-client-15`)
- Espacio en disco: estimar `2x` el size actual de la DB para tener headroom
  (`SELECT pg_size_pretty(pg_database_size(current_database()))` en Supabase SQL editor)

---

## Procedimiento — Supabase (DB del monolito)

### 1. Obtener connection string directo (no pooler)

En Supabase Dashboard → Project Settings → Database → Connection string →
**Direct connection** (no `pgbouncer`, no `transaction` mode). Format:

```
postgresql://postgres.kbrcqyjnrbjlzfolpcsx:<PASSWORD>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

⚠️ **NO usar el pooler URL** porque `pg_dump` necesita protocolo PG nativo, no
el subset que ofrece pgbouncer.

### 2. Snapshot full

```powershell
# Local (Windows PowerShell)
$DATE = Get-Date -Format "yyyy-MM-dd"
$DUMP_DIR = "C:\backups\studioflow\$DATE-pre-fX"
New-Item -ItemType Directory -Force $DUMP_DIR | Out-Null

$env:PGPASSWORD = "<password>"
pg_dump `
  -h "aws-0-us-east-1.pooler.supabase.com" `
  -p 5432 `
  -U "postgres.kbrcqyjnrbjlzfolpcsx" `
  -d "postgres" `
  --format=custom `
  --no-owner `
  --no-privileges `
  --verbose `
  --file="$DUMP_DIR\monolith-supabase.dump"

# Schema-only complementario (text format, para diff con migrations)
pg_dump `
  -h "aws-0-us-east-1.pooler.supabase.com" `
  -p 5432 `
  -U "postgres.kbrcqyjnrbjlzfolpcsx" `
  -d "postgres" `
  --schema-only `
  --no-owner `
  --no-privileges `
  --file="$DUMP_DIR\monolith-schema.sql"
```

### 3. Verificación post-dump

```powershell
# Listar contenido del dump (sin extraerlo)
pg_restore -l "$DUMP_DIR\monolith-supabase.dump" | Select-Object -First 50

# Contar tablas en el dump
pg_restore -l "$DUMP_DIR\monolith-supabase.dump" | Select-String "TABLE DATA" | Measure-Object
# Esperado: >= 50 tablas

# Verificar size razonable (1MB mínimo)
Get-Item "$DUMP_DIR\monolith-supabase.dump" | Select-Object Length, LastWriteTime
```

### 4. Restore de prueba (en branch separado de Supabase)

**Antes de aplicar migraciones destructivas en producción**, restaurar el dump
en un Supabase Branch (feature: Branching) y validar:

```bash
# En el branch
pg_restore \
  -h "<branch-host>" \
  -p 5432 \
  -U "postgres.<branch-id>" \
  -d "postgres" \
  --no-owner --no-privileges \
  --verbose \
  "<DUMP_FILE>"
```

Si el restore termina sin errores, el dump es válido para rollback.

---

## Procedimiento — Postgres local finanzapp (pre-ETL F5)

### 1. Dump completo

```powershell
$env:PGPASSWORD = "postgres"
pg_dump `
  -h "localhost" `
  -p 5432 `
  -U "postgres" `
  -d "finanzapp" `
  --format=custom `
  --no-owner `
  --no-privileges `
  --verbose `
  --file="$DUMP_DIR\finanzapp-local.dump"

# Schema-only para diff
pg_dump `
  -h "localhost" `
  -p 5432 `
  -U "postgres" `
  -d "finanzapp" `
  --schema-only `
  --file="$DUMP_DIR\finanzapp-schema.sql"
```

### 2. Counts pre-ETL (para validar dest después)

```powershell
$env:PGPASSWORD = "postgres"
psql -h localhost -U postgres -d finanzapp -c @'
SELECT 'accounts' as t, count(*) FROM accounts UNION ALL
SELECT 'transactions', count(*) FROM transactions UNION ALL
SELECT 'debts', count(*) FROM debts UNION ALL
SELECT 'loans', count(*) FROM loans UNION ALL
SELECT 'subscriptions', count(*) FROM subscriptions UNION ALL
SELECT 'goals', count(*) FROM goals
'@ | Out-File "$DUMP_DIR\finanzapp-counts-pre.txt"
```

---

## Storage / S3 sync (opcional pero recomendado)

Si tienes acceso a S3 (Cloudflare R2, AWS S3, Backblaze B2):

```powershell
# Upload con AWS CLI (configurado con perfil "backup")
aws s3 sync $DUMP_DIR "s3://my-backup-bucket/studioflow/$DATE-pre-fX/" `
  --profile backup `
  --storage-class STANDARD_IA `
  --exclude "*.txt"
```

Retention: 30 días en STANDARD_IA, después archive a Glacier Deep Archive (~$1/TB).

---

## Política de retención

| Tipo de snapshot | Ubicación | Retención |
|---|---|---|
| Pre-Fase (monolith + finanzapp) | VPS `/srv/backups/` + S3 | 6 meses |
| Daily incremental (post-monolith) | VPS solamente | 30 días |
| Pre-deploy a producción | VPS + S3 | 90 días |
| Post-mortem (si falla migración) | S3 + offline disk | Indefinido |

---

## Restore de emergencia

### Cenario A: revertir migración fallida (Supabase)

```bash
# 1. Snapshot pre-revert (capturar el estado roto por si acaso)
pg_dump --format=custom --file=/tmp/broken-state.dump ...

# 2. Drop schemas mutados (CUIDADO — destructivo)
psql ... -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 3. Restore desde snapshot pre-fase
pg_restore \
  -h "<supabase-host>" \
  -p 5432 \
  -U "postgres.<id>" \
  -d "postgres" \
  --no-owner --no-privileges \
  --verbose \
  --clean --if-exists \
  "/srv/backups/studioflow/<DATE>-pre-fX/monolith-supabase.dump"
```

### Cenario B: re-import single table

```bash
pg_restore \
  ... \
  --table=public.fin_payables \
  --data-only \
  "/srv/backups/.../monolith-supabase.dump"
```

---

## Checklist completo para F0

- [ ] Espacio en disco verificado (>=10 GB libres en VPS)
- [ ] Credenciales Supabase válidas (Direct connection probada con `psql -c '\dn'`)
- [ ] Credenciales finanzapp local válidas
- [ ] pg_dump version >= 15 instalado y en PATH
- [ ] Directorio destino creado con permisos 600
- [ ] Dump monolith ejecutado (count tablas >= 50)
- [ ] Dump finanzapp ejecutado (count rows snapshot tomado)
- [ ] Verificación de integridad con pg_restore -l
- [ ] Sync a S3 (opcional)
- [ ] Restore de prueba en Supabase branch (recomendado pre-F3/F5)

---

## Notas operacionales

- Si Supabase está saturado (Direct connection rate-limited), bajar el throughput
  con `-j 1` (single worker) o ejecutar en off-peak hours (2-4am UTC).
- Para dumps muy grandes (>5 GB), usar `--compress=9` y validar con
  `pg_restore --list` antes de confiar.
- **Never** versionar dumps en git — son binarios, contienen PII, y son enormes.
  Solo deben vivir en `/srv/backups/` o S3.
- Los counts pre-ETL deben matchear EXACTAMENTE con post-ETL — si hay diff,
  abortar y rollback antes de continuar.
