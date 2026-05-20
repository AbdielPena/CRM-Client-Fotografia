# F8 — Decommission del ecosistema federado (Studio Business Hub)

Checklist final para apagar el hub y los sistemas viejos tras la unificación a
monolito (`my.abbypixel.com`). **No ejecutes este checklist hasta que los PRs
#7 → #11 estén mergeados, las migrations aplicadas en Supabase, y el monolito
verificado en staging por al menos 7 días.**

---

## 0. Pre-checks (verificar antes de empezar)

- [ ] PRs #7 (F1) → #12 (F7) mergeados a `main` en orden
- [ ] Migrations `20260520000100..600` aplicadas en Supabase staging
- [ ] `npx supabase gen types typescript --linked > types/supabase.ts` ejecutado — services migran del `untypedServer()` al cliente tipado normal
- [ ] Smoke tests pasan en staging:
  - [ ] Crear item de inventario → ver en `/inventory/items`
  - [ ] Configurar tax_config + secuencia NCF en `/settings/fiscal`
  - [ ] Emitir NCF en una factura → verificar incremento de `current_value`
  - [ ] Pagar invoice via Stripe test → verificar income en `/finance/transactions` con `external_reference='invoice:<id>'`
  - [ ] Conectar cuenta Mailcow → ver inbox sync funcionar
- [ ] Backup completo de las 3 DBs externas (preserve datos 6 meses):
  - [ ] `pg_dump --schema=inventario` → `_archive/inventario-YYYYMMDD.sql.gz`
  - [ ] `pg_dump` finanzapp PG local → `_archive/finanzapp-YYYYMMDD.sql.gz`
  - [ ] `pg_dump --schema=public` de studio-hub Supabase → `_archive/studio-hub-YYYYMMDD.sql.gz`
- [ ] Comunicar al equipo / usuarios beta: "El próximo lunes los subdominios viejos se apagan; usa `my.abbypixel.com` desde ahora"

---

## 1. ETL de datos viejos (módulo por módulo)

Antes de apagar nada, migrar los datos a las tablas nuevas del monolito.

### Inventario (esquema YA en mismo Supabase, in-DB)

```bash
cd studioflow
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx scripts/migrate-inventario.ts --studio-id <studio-uuid>
```

Espera output:
```
[migrate-inventario] inventario.items → public.inv_items   ✓ 47 rows
[migrate-inventario] inventario.item_units → public.inv_item_units   ✓ 132 rows
[migrate-inventario] inventario.clients → public.clients (merge)   ✓ 8 nuevos, 12 merged
...
[migrate-inventario] COUNT validation:
  inventario.items: 47  →  public.inv_items: 47   ✓
  inventario.loans: 22  →  public.inv_loans: 22   ✓
```

### Finance (cross-cluster, Postgres local → Supabase)

```bash
cd studioflow
DATABASE_URL_FINANZAPP=postgres://postgres:postgres@localhost:5432/finanzapp \
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx scripts/migrate-finanzapp.ts --studio-id <studio-uuid>
```

Espera mismas validaciones de counts. **Si counts no cuadran → STOP, investigar antes de continuar.**

> **Nota:** estos scripts NO se han implementado todavía (TODO próximo PR).
> Cuando estén listos, este checklist los referencia. Por ahora, copiar
> manualmente vía SQL en Supabase SQL Editor es viable para datasets pequeños.

---

## 2. Apagar `hub.abbypixel.com`

### En el VPS (`hub@abbypixel-vps`)

```bash
ssh hub@<ip-vps>
pm2 stop hub
pm2 delete hub
pm2 save --force
exit
```

### En nginx del VPS (root)

Editar `/etc/nginx/sites-available/hub.abbypixel.com`:

```nginx
server {
    listen 443 ssl http2;
    server_name hub.abbypixel.com;

    # SSL configs...

    location / {
        return 410 "Gone — el Studio Business Hub fue descontinuado. Usa https://my.abbypixel.com";
        add_header Content-Type text/plain;
    }
}
```

Recargar:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

Verificar:
```bash
curl -I https://hub.abbypixel.com
# Esperado: HTTP/2 410
```

---

## 3. Apagar `finance.abbypixel.com` (finanzapp)

### En VPS

```bash
ssh finz@<ip-vps>
pm2 stop finz
pm2 delete finz
pm2 save --force
exit
```

### nginx 410

Editar `/etc/nginx/sites-available/finance.abbypixel.com` (también `fi.abbypixel.com` si aplica):

```nginx
location / {
    return 410 "Gone — Finanzas vive ahora en https://my.abbypixel.com/finance";
    add_header Content-Type text/plain;
}
```

Reload nginx.

---

## 4. Apagar `inventory.abbypixel.com` (inventario-app)

```bash
ssh invt@<ip-vps>
pm2 stop invt
pm2 delete invt
pm2 save --force
exit
```

nginx 410 → `inventory.abbypixel.com` redirect a `my.abbypixel.com/inventory/items`.

---

## 5. Apagar `billing.abbypixel.com` / `facturacion.abbypixel.com` (studioflow-platform)

```bash
ssh facturacion@<ip-vps>
pm2 stop facturacion
pm2 delete facturacion
pm2 save --force
exit
```

nginx 410 → redirect a `my.abbypixel.com/invoices`.

---

## 6. Drop schemas viejos en Supabase

**Solo después de 14 días desde el switchover sin issues.** Los schemas viejos
se mantienen como read-only por si hay que consultar algún dato históricamente.

```sql
-- En Supabase SQL Editor (project kbrcqyjnrbjlzfolpcsx)
-- Schema de inventario (compartía mismo project con studioflow)
DROP SCHEMA inventario CASCADE;

-- En project del hub (si era distinto)
DROP SCHEMA public CASCADE; -- ⚠️ SOLO si el hub tenía su propio project Supabase
```

> ⚠️ **CASCADE** elimina todas las tablas, views, functions del schema. Es
> destructivo. Verificar que el ETL transfirió todo antes de ejecutar.

---

## 7. Limpiar cookies legacy del navegador (usuarios)

Las cookies `.abbypixel.com` del hub viejo quedan huérfanas en navegadores con
sesión activa. NO bloquean nuevas sesiones de `my.abbypixel.com` (que usa
host-only cookies), pero ocupan espacio.

**Mensaje a usuarios:**
> Tras el cambio, abre Chrome → DevTools (F12) → Application → Cookies →
> elimina cookies de `*.abbypixel.com`. O alternativamente, modo incógnito
> resuelve cualquier cookie stale.

---

## 8. Archivar repos viejos

```bash
cd ~/Desktop/Claude/Programas/
mkdir -p _archive
mv studio-hub _archive/studio-hub-decommissioned-YYYYMMDD
mv studioflow-platform _archive/studioflow-platform-decommissioned-YYYYMMDD
mv finanzapp _archive/finanzapp-decommissioned-YYYYMMDD
mv inventario-app _archive/inventario-app-decommissioned-YYYYMMDD
```

En GitHub:
- Archive los 4 repos (Settings → Archive this repository)
- README de cada uno: agregar nota "Este proyecto se descontinuó el YYYY-MM-DD. Su funcionalidad vive ahora en [studioflow](https://github.com/AbdielPena/CRM-Client-Fotografia)"

---

## 9. Cleanup del código residual

Este PR (F8) ya borró del CRM:
- `lib/hub-client.ts` (emisor de eventos federados)
- `app/api/auth/hub-sso/route.ts` (SSO inbound)
- `components/app-switcher.tsx` (cross-app dropdown)
- Reemplaza el header del sidebar con brand simple del studio

Verificar que no quedan refs:
```bash
grep -r "hub.abbypixel\|HUB_HMAC\|HUB_JWT\|HUB_URL\|hub-client\|AppSwitcher\|hub-sso" \
  --include="*.ts" --include="*.tsx" --include="*.md" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=_archive \
  --exclude-dir=docs \
  studioflow/
# Esperado: 0 resultados (excepto docs/decommission-hub.md que es este file)
```

---

## 10. Variables de entorno a limpiar (VPS prod)

En `~/.env` o `~/htdocs/my.abbypixel.com/.env.production` quitar:

```diff
- HUB_JWT_SECRET=...
- HUB_HMAC_SECRET=...
- HUB_URL=https://hub.abbypixel.com
- HUB_JWT_ISSUER=studio-hub
```

Reload pm2:
```bash
pm2 restart studioflow --update-env
```

---

## 11. Post-mortem y comunicación

- [ ] Update README de studioflow: añadir sección "Arquitectura post-unificación"
  explicando que los módulos Finance/Inventory/Mail eran sistemas separados
  pre-2026-05.
- [ ] Slack/email a stakeholders: "Switchover completado. Beneficios: 1 login,
  1 deploy, 0 errores SSO federado, módulos cross-conectados nativamente
  (invoice.paid → income automático, etc.)"
- [ ] Tag release `v2.0.0-monolith` en GitHub: marca el milestone de
  unificación arquitectural.

---

## Rollback plan (por si todo se va al carajo)

Si algo crítico falla en los 14 días post-switchover y necesitas volver a los
sistemas viejos:

1. Restaurar `pm2 start ecosystem` con los configs viejos de los 4 systems
2. Reactivar nginx configs (revertir 410 a proxy_pass)
3. Las DBs viejas siguen intactas (no se dropearon hasta paso 6)
4. Usuarios re-loguean en cada sistema (cookies se reactivan)

**Punto de no retorno:** después de `DROP SCHEMA inventario CASCADE` ya no hay
rollback fácil. Por eso los 14 días de gracia.
