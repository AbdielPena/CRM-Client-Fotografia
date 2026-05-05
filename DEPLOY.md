# StudioFlow — Despliegue a producción (BanaHosting + Supabase)

## Stack final

```
Dominio:    my.abbypixel.com  (HTTPS via AutoSSL en cPanel)
Frontend:   Next.js 14 → BanaHosting cPanel (Node.js Selector)
Backend:    Supabase Free (Postgres + Auth + Storage + RLS)
Email:      SMTP de my.abbypixel.com
Desktop:    Tauri (apunta a my.abbypixel.com)
Móvil:      Capacitor (apunta a my.abbypixel.com)
Pagos:      no aplica
Calendar:   Google Calendar (bidireccional)
```

> **Nota Supabase Free:** se suspende a los 7 días de inactividad. Una vez en
> producción con tráfico real esto no pasa. Si querés garantías y backups
> automáticos, considerá el plan Pro a futuro ($25/mes).

---

## 1. Variables de entorno de producción

En cPanel → **Setup Node.js App** → tu app → **Environment variables** —
agregar cada una manualmente.

**Estrategia simple:** copiar todas las que tenés en tu `env.local` actual
de desarrollo, y solo cambiar las que se indican abajo. Los nombres exactos
ya los tenés en tu archivo local.

**Cambian para producción:**

- `NEXT_PUBLIC_APP_URL` → `https://my.abbypixel.com`
- `NODE_ENV` → `production`
- **Secret de cookies del portal** (ese que en tu env.local empieza con `OAUTH_STATE_`) → generar uno NUEVO con `openssl rand -hex 32` y NO reutilizar el de dev
- `NEXTAUTH_URL` → `https://my.abbypixel.com`
- `SMTP_FROM_EMAIL` → `mail@my.abbypixel.com`
- `SMTP_USER` → tu usuario SMTP del cPanel para `my.abbypixel.com`
- `SMTP_HOST` → el host SMTP que te da BanaHosting (típicamente `mail.my.abbypixel.com`)
- `SMTP_PORT` → `465` (SSL) o `587` (TLS)
- `SMTP_SECURE` → `true` si usás 465, `false` si 587
- **Password SMTP** (variable que en tu env.local empieza con `SMTP_PASS`) → la password de la cuenta de email creada en cPanel
- `SMTP_FROM_NAME` → nombre que verá el cliente (ej: `Abby Pixel`)

**Se mantienen iguales que en dev (mismo proyecto Supabase):**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Service role del proyecto Supabase** (la variable que tenés en tu env.local que empieza con `SUPABASE_SERVICE`)

**Solo si activás Google Calendar:**

- `GOOGLE_CLIENT_ID`
- **Google OAuth client secret** (variable que en tu env.local empieza con `GOOGLE_CLIENT_S`)
- `GOOGLE_REDIRECT_URI` → `https://my.abbypixel.com/api/integrations/google/callback`

> **NO setear `STORAGE_DRIVER`** en producción. Sin esa variable usa Supabase
> Storage automáticamente. `STORAGE_DRIVER=local` es solo para desarrollo.

---

## 2. Supabase — preparación

### Buckets de Storage (ya creados)

Estos buckets ya existen en tu proyecto Supabase, los creé desde acá:

| Bucket | Visibility | Límite |
|---|---|---|
| `gallery-originals` | Privado | 200 MB |
| `gallery-renditions` | Público | 50 MB |
| `gallery-watermarks` | Privado | 5 MB |
| `client-deliveries` | Público | 500 MB |

### Verificar migraciones

En el SQL Editor del dashboard de Supabase ejecutá:

```sql
select count(*) from public.client_deliveries;
select count(*) from public.gallery_collections;
select access_code from public.clients limit 1;
```

Si alguna falla, aplicar las migraciones de `supabase/migrations/` en orden.

---

## 3. Despliegue en BanaHosting cPanel

### a) Subir el código

```bash
# Por SSH (recomendado):
# El subdominio my.abbypixel.com se mapea a ~/my/, entonces clonamos ahí.
cd ~/my

# Backup de los archivos default que cPanel haya puesto
mkdir -p ~/my-backup-cpanel
mv * ~/my-backup-cpanel/ 2>/dev/null || true
mv .htaccess ~/my-backup-cpanel/ 2>/dev/null || true

# Clonar al directorio actual
git clone https://github.com/AbdielPena/CRM-Client-Fotografia.git .
```

### b) Crear la app Node

cPanel → **Setup Node.js App** → **Create Application**:

- **Node version:** la más alta disponible (>= 18.17)
- **Application mode:** Production
- **Application root:** `my`
- **Application URL:** `my.abbypixel.com`
- **Application startup file:** dejar default por ahora
- Click **Create**

Después en la app creada:

1. Botón **Run NPM Install**
2. Pestaña **Environment variables** → pegar todas las del paso 1
3. Click **Save**

### c) Build de producción

Por SSH dentro de la carpeta del proyecto:

```bash
# Activar el venv de Node de cPanel (el path exacto te lo da el panel arriba)
source /home/USUARIO/nodevenv/my/20/bin/activate

# Build
npm run build
```

### d) Cambiar startup file a `npm start`

En la app Node de cPanel:

- **Application startup file:** poner `npm`
- En "Detected Configuration files" o similar, agregar `start` como argumento

(Si BanaHosting no te deja args al startup, el `package.json` ya tiene
`start:cpanel` que respeta el `$PORT` que cPanel te asigna.)

### e) Restart y verificar

- Click **Restart** en la app
- Abrir `https://my.abbypixel.com/api/health` → debe devolver `{"status":"ok"}`
- Si tira error, ver logs: cPanel → tu app → **View detailed log**

---

## 4. Tauri — wrapper desktop

### Pre-requisitos en tu máquina

- Rust + Cargo: instalar desde https://rustup.rs/
- Windows: WebView2 (viene con Edge moderno, ya lo tenés)
- macOS: Xcode CLI tools (`xcode-select --install`)

### Inicializar (solo la primera vez)

```bash
npm install --save-dev @tauri-apps/cli@latest
```

Ya están creados todos los archivos necesarios en `src-tauri/`:

- `tauri.conf.json` apunta a `https://my.abbypixel.com`
- `Cargo.toml` con dependencias mínimas
- `src/main.rs` y `src/lib.rs` con la app
- `capabilities/default.json`

### Iconos

Antes de buildear necesitás iconos en `src-tauri/icons/`:

```bash
# Generar iconos desde un PNG cuadrado de 1024×1024
npx @tauri-apps/cli icon ruta/al/logo-1024.png
```

Esto genera todos los tamaños necesarios automáticamente.

### Build del binario

```bash
npm run tauri:build              # tu plataforma actual
npm run tauri:build:win          # Windows .msi + .exe (NSIS)
npm run tauri:build:mac          # macOS .dmg
npm run tauri:build:linux        # Linux .deb + .AppImage
```

Los binarios quedan en `src-tauri/target/release/bundle/`.

### Distribución

Subí los archivos a `https://my.abbypixel.com/download/` o donde prefieras.
Para auto-update agregá `tauri-plugin-updater` después.

---

## 5. Móvil (Capacitor)

`capacitor.config.ts` ya apunta a `https://my.abbypixel.com` por defecto.

### Build Android

```bash
npm run mobile:add:android          # solo la primera vez
npm run mobile:sync
npm run mobile:open:android         # abre Android Studio
```

En Android Studio: Build → Generate Signed Bundle / APK.

### Build iOS

```bash
npm run mobile:add:ios              # solo la primera vez
npm run mobile:sync
npm run mobile:open:ios             # abre Xcode
```

En Xcode: Product → Archive → Distribute App.

---

## 6. Google Calendar (bidireccional)

1. Ir a https://console.cloud.google.com/ → crear proyecto "StudioFlow"
2. APIs & Services → Library → habilitar **Google Calendar API**
3. APIs & Services → Credentials → **Create Credentials → OAuth client ID**
   - Application type: Web application
   - Authorized redirect URIs: `https://my.abbypixel.com/api/integrations/google/callback`
4. Copiar el Client ID y el Client Secret a las variables de entorno
5. En la app: `/settings/integrations/google` → conectar tu cuenta de Google

---

## 7. SMTP — verificar deliverabilidad

### Crear cuenta de email en cPanel

1. cPanel → **Email Accounts** → Create
2. Email: `mail@my.abbypixel.com`
3. Password: una fuerte (la usás como password SMTP)

### SPF + DKIM (importante para evitar spam)

cPanel → **Email Deliverability** → para `my.abbypixel.com`:

- Verificar que dice "Valid" en SPF y DKIM
- Si dice "Invalid" o "Not configured", click "Repair" o "Manage" y seguir las
  instrucciones (suele ser agregar 2 records DNS)

### Probar envío

Después del primer deploy, crear un cliente con tu email personal y verificar:

- Llega el email con el código de acceso al portal
- En Gmail no aparece como "Vía sender" o como spam
- El "From" muestra el nombre del estudio, no el dominio crudo

---

## 8. Checklist de seguridad pre-launch

- [ ] El secret HMAC del portal regenerado para producción (32+ chars random)
- [ ] La service role de Supabase NO está expuesta en el código fuente
- [ ] Variables `NEXT_PUBLIC_*` no contienen secretos
- [ ] HTTPS funciona en `https://my.abbypixel.com` (AutoSSL OK)
- [ ] SPF + DKIM verificados para `my.abbypixel.com`
- [ ] Buckets `gallery-originals` y `gallery-watermarks` son privados
- [ ] Buckets `gallery-renditions` y `client-deliveries` son públicos
- [ ] `/api/health` responde `200`
- [ ] Migraciones SQL aplicadas (verificación del paso 2)
- [ ] Usuario admin del studio puede loguearse en producción
- [ ] Crear cliente de prueba con tu email → recibís código de acceso por mail
- [ ] Login al portal con código → ves el dashboard
- [ ] Subís foto a galería → se procesa y muestra
- [ ] Cliente da like → llega notificación
- [ ] Mandás contrato → cliente firma desde el celular → llegan emails
- [ ] Creás entrega → cliente recibe email + descarga archivos del portal
- [ ] PDF de factura se ve bien al imprimir

---

## 9. Operación día a día

### Logs

- App Node: cPanel → tu app → "View detailed log"
- Postgres / Auth / Storage: Supabase Dashboard → Logs
- Email queue: en SQL Editor de Supabase
  ```sql
  select id, to_email, subject, status, last_error, created_at
  from email_queue
  where status = 'failed'
  order by created_at desc limit 20;
  ```

### Backups

- **Postgres:** Supabase Free tiene snapshot de los últimos 7 días.
  Para extra seguridad podés correr `pg_dump` semanal a tu cPanel.
- **Storage:** archivos quedan en buckets de Supabase. No hay backup
  automático en plan Free — guardá copia local de los más críticos
  (logos, watermarks).
- **Código:** ya está en GitHub.

### Updates de código

```bash
cd ~/my
bash scripts/deploy-server.sh
# Restart app desde cPanel
```

---

## Stack instalado (referencia)

```
Frontend:    Next.js 14 (App Router) + React 18 + Tailwind + shadcn/ui
Backend:     Supabase (Postgres + Auth + Storage + RLS + RPCs)
Email:       SMTP propio via nodemailer
Imágenes:    Sharp (server-side, inline processing)
Desktop:     Tauri 2 (Rust + WebView nativo)
Móvil:       Capacitor 8 (WebView Android + iOS)
PWA:         Service worker + manifest
```
