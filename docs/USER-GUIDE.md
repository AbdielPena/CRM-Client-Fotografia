# StudioFlow — Guía para fotógrafos

Bienvenido. Esta guía te lleva paso a paso desde crear tu cuenta hasta cobrar
tu primera factura.

> 💡 **¿Eres nuevo?** Empieza por el [Onboarding wizard](#1-primeros-pasos).
> Se auto-detecta lo que ya hiciste, así que puedes saltarte pasos sin
> preocuparte.

---

## Tabla de contenido

1. [Primeros pasos (Onboarding)](#1-primeros-pasos)
2. [Configura tu marca](#2-configura-tu-marca)
3. [CRM: clientes y proyectos](#3-crm-clientes-y-proyectos)
4. [Facturación con NCF (RD)](#4-facturación-con-ncf-rd)
5. [Galerías para clientes](#5-galerías-para-clientes)
6. [Inventario de equipo](#6-inventario-de-equipo)
7. [Finanzas y reportes](#7-finanzas-y-reportes)
8. [Correo unificado (Mailcow)](#8-correo-unificado-mailcow)
9. [Equipo y tareas](#9-equipo-y-tareas)
10. [Chat interno](#10-chat-interno)
11. [Automatizaciones](#11-automatizaciones)
12. [Plantillas de proyecto](#12-plantillas-de-proyecto)
13. [API + Webhooks (avanzado)](#13-api--webhooks-avanzado)
14. [Seguridad: 2FA + recovery codes](#14-seguridad-2fa)
15. [Plan y facturación SaaS](#15-plan-y-facturación-saas)
16. [FAQ y solución de problemas](#16-faq-y-solución-de-problemas)

---

## 1. Primeros pasos

### Crear tu estudio

1. Ve a `https://my.abbypixel.com/register`
2. Llena: tu email + contraseña + nombre del estudio
3. Al confirmar, te lleva al **Onboarding wizard** automáticamente

### El wizard tiene 10 pasos:

| # | Paso | Tiempo |
|---|---|---|
| 1 | Información del estudio (logo + color) | 2 min |
| 2 | Crea tu primer paquete | 3 min |
| 3 | Configura fiscal (NCF, ITBIS) — solo RD | 5 min |
| 4 | Plantilla de contrato | 3 min |
| 5 | Agrega tu primer cliente | 1 min |
| 6 | Crea tu primer proyecto | 2 min |
| 7 | Conecta Mailcow (opcional) | 5 min |
| 8 | Conecta Google Calendar (opcional) | 3 min |
| 9 | Crea tu primera automatización (opcional) | 5 min |
| 10 | Invita a tu equipo (opcional) | 2 min |

**Total ~30 min** para tener todo configurado.

> Cada paso se puede **saltar** (icono ⏭). Vuelve cuando quieras desde
> `/onboarding`.

### Barra de progreso en el dashboard

Mientras no termines, verás un banner rosa en `/dashboard` con tu progreso.
Cuando llegues al 100% el banner desaparece. ✨

---

## 2. Configura tu marca

`Configuración → Marca y personalización` (`/settings/branding`)

Aquí controlas **todo** lo visible al cliente:

### 🎨 Identidad visual
- Logo (claro + oscuro para fondos invertidos)
- Favicon (icono del browser)
- Color primario (botones, links — usa el picker o pega un hex)
- Color secundario (acentos)
- Font family (opcional, default Inter)

### 🌎 Locale
- Moneda: DOP, USD, EUR, MXN, COP, ARS
- Idioma: Español (RD/MX/ES), English, Português
- Zona horaria (America/Santo_Domingo default)
- Formato fecha (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)

### 📧 Defaults de correo
- "From" name (lo que ve el cliente: "Abby Pixel Studio")
- "From" email (`hola@tudominio.com`)
- Reply-to email
- **Firma HTML** que se agrega a cada email outbound

### 🌐 Dominio personalizado (plan Pro+)
- Apuntar `portal.tuestudio.com` a `my.abbypixel.com` vía CNAME
- Click "Verificar" después de configurar DNS
- Los clientes ven `portal.tuestudio.com` en vez de `my.abbypixel.com`

### 🎯 White-label (plan Pro+)
- Ocultar "Powered by StudioFlow" del portal cliente
- Custom Terms URL + Privacy URL
- Custom Footer HTML (al pie de invoices, portal, galerías)

### ✏️ Copy de páginas públicas (HTML editable)
- Bienvenida del portal cliente
- Intro del formulario de reserva
- Footer del PDF de invoice

### 📱 Redes sociales
- Website, Instagram, Facebook, WhatsApp, email contacto, dirección
- Aparecen en el footer de las páginas públicas

---

## 3. CRM: clientes y proyectos

### Crear un cliente

`Clientes → Nuevo cliente`

- Nombre (requerido)
- Email (opcional, pero recomendado para portal acceso)
- Teléfono, dirección, Instagram, notas
- **Source**: de dónde vino (Instagram, referido, walk-in, etc.)

Al crear con email, el sistema **automáticamente**:
1. Genera un código de acceso al portal cliente
2. Le envía un email con su link de acceso
3. Dispara `client.created` para automatizaciones + webhooks

### Crear un proyecto

`Proyectos → Nuevo proyecto`

Mínimo requerido:
- Cliente (de tu lista)
- Nombre del proyecto ("Boda María & Juan")
- Fecha del evento (`event_date`)
- Tipo (boda, sesión, quince, corporativo...)

Opcional:
- Ubicación
- Total amount (DOP)
- Notas internas
- Vincular a un paquete (auto-calcula total)

### Estados del proyecto

Configurables en `Configuración → Estados de proyecto` (V2). Default:
`Consulta → Reservado → Sesión realizada → Edición → Entregado`.

### Pipeline de leads

`Leads` muestra el funnel kanban. Drag-and-drop entre stages.

---

## 4. Facturación con NCF (RD)

> Solo aplica si emites facturas en República Dominicana. Si no, puedes
> ignorar esta sección — funcionarán como facturas comunes.

### Setup inicial

`Configuración → Fiscal RD` (`/settings/fiscal`)

1. **RNC del estudio** (9 dígitos)
2. **ITBIS** rate (18% default)
3. **Secuencias NCF**: por cada tipo (B01, B02, B11, B14...) define `range_start`,
   `range_end`, `current_value`

### Crear factura

`Facturas → Nueva factura`

- Cliente (auto-llena RNC si lo tiene)
- Items (descripción, cantidad, precio, ITBIS rate)
- Total se calcula automáticamente
- **NCF se asigna AUTOMÁTICAMENTE** cuando marcas "Enviada" (status `sent`)

### Marcar como pagada

Detalle de factura → "Marcar como pagada" → llena: monto, método, fecha.

El sistema **automáticamente**:
1. Inserta el pago en `payments` table
2. Crea una `fin_transaction.ingreso` (visible en Finanzas)
3. Si está al 100%, dispara automation + webhook `invoice.paid` + `payment.received`

### Reportes DGII 606 y 607

`Configuración → Fiscal → Reportes`

- **607 (Ventas)**: ya funciona — exporta facturas con NCF del mes
- **606 (Compras)**: requiere que registres pagos a proveedores en `fin_payables`
  con su NCF de proveedor (campo `ncf_proveedor`)

Output: archivo `.txt` con formato pipe-delimited oficial DGII. Lo subes
manualmente al portal DGII.

---

## 5. Galerías para clientes

`Galerías → Nueva galería`

1. Selecciona cliente + proyecto
2. Upload de fotos (drag-drop, formato JPG/PNG, max 25MB por foto)
3. El sistema procesa thumbnails automáticamente
4. **Compartir**: copia el link público `gal.tuestudio.com/[token]`
5. El cliente ve la galería, hace selección de favoritas, descarga ZIP

### Opciones avanzadas

- **Colecciones**: agrupar dentro de la galería (ceremonia, fiesta, retratos)
- **Watermark**: agrega tu logo o texto sobre las renditions web (no afecta el ZIP final)
- **Quotas**: máximo de fotos seleccionables por el cliente
- **Expiración**: el link caduca después de N días

---

## 6. Inventario de equipo

`Inventario` (`/inventory`) — gestiona TODO tu equipo:

### Items y unidades

- **Items kind=serialized**: cámaras, lentes, equipos con N/S único
  - Cada unidad tiene su QR, código interno, garantía
  - Tracking individual: dónde está, quién la tiene
- **Items kind=bulk**: tarjetas SD, baterías (contador agregado)

### Préstamos internos vs Alquileres

| Concepto | Para quién | Cobra dinero |
|---|---|---|
| **Préstamo** (`/inventory/loans`) | Staff interno (asistente, editor) | No |
| **Alquiler** (`/inventory/rentals`) | Cliente comercial | Sí — genera `fin_transaction.ingreso` al recibir pago |

### Reservas

`/inventory/reservations` — apartar equipo para fecha futura. Convertible
a préstamo o alquiler al llegar el día.

### Mantenimiento

`/inventory/maintenance` — reparaciones, calibraciones, limpiezas. Trackea
costo + técnico + próximo mantenimiento sugerido.

### Movimientos (ledger)

Cada cambio de status (entrada, salida, perdida, dano) se registra en
`inv_stock_movements`. Visible en el detalle de cada unidad.

---

## 7. Finanzas y reportes

### Cuentas

`/finance/accounts` — cuentas bancarias, efectivo, tarjetas. Cada
transacción está vinculada a una cuenta.

### Transacciones

`/finance/transactions` — ingresos, gastos, transferencias. Filtros por
tipo, categoría, cuenta, rango de fechas.

### Cuentas por Cobrar (CxC) y Pagar (CxP)

- `/finance/receivables` — facturas pendientes de cobro
- `/finance/payables` — facturas a proveedores que debes pagar

### Deudas y Préstamos

- `/finance/debts` — préstamos que tú **debes** (financiamiento de equipo,
  préstamo bancario)
- `/finance/loans` — préstamos que tú **diste**

### Metas

`/finance/goals` — ahorros para equipos, vacaciones, etc. Con progress bar.

### Suscripciones recurrentes

`/finance/subscriptions` — Adobe CC, Lightroom, hosting, dominio, seguros.
El cron diario crea automáticamente el cargo cuando llega `proxima_fecha`.

### Diezmo (10%)

`/finance/tithe` — si marcas ingresos con `aplica_diezmo=true`, el cron
mensual calcula el 10% el día 28 de cada mes.

### Reportes avanzados

`/reports`:
- **P&L** (Profit & Loss): ingresos - gastos del año + breakdown por categoría
- **Cash Flow** 12m: chart con barras verde (ingresos) + rojo (gastos)
- **AR Aging**: facturas pendientes agrupadas (current, 1-30, 31-60, 61-90, +90 días)
- **Top 10 clientes**: ranking por revenue del año
- **Forecast 6m**: proyección basada en receivables + pending invoices +
  upcoming projects + subscriptions + payables

### Export a CSV

Cada reporte tiene botón "Descargar CSV" con BOM UTF-8 (compatible Excel).

---

## 8. Correo unificado (Mailcow)

`/mail/inbox`

### Setup

`Configuración → Mail` (`/settings/mail`)

Conecta tu cuenta Mailcow con IMAP + SMTP:
- IMAP host/port (típicamente 993 secure)
- SMTP host/port (587 con STARTTLS)
- Usuario + password (se cifra con pgsodium AEAD)

Test connection antes de guardar.

### Inbox / Sent / Drafts

3 tabs en `/mail/inbox` + `/mail/sent` + `/mail/drafts`. El cron sincroniza
IMAP cada 5 minutos.

### Compose

- Auto-save cada 5 segundos (no pierdes texto si cierras la pestaña)
- Drafts aparecen en `/mail/drafts` con timestamp del último cambio
- Retomar draft: click → vuelves donde lo dejaste

### Threading

Las respuestas se agrupan en threads automáticamente. Click un thread →
ves toda la conversación cronológica.

### Vinculación cross-módulo

Al componer, puedes vincular el mensaje a:
- Un cliente (chip 👤)
- Un proyecto (chip 📁)
- Una factura (chip 🧾)

Visible como tags en el inbox.

### Bounces

Si un email rebota, aparece en tabla `mail_bounce_events` y el message
pasa a status `bounced`. También recibes notification in-app.

---

## 9. Equipo y tareas

### Invitar miembros

`Configuración → Miembros del studio` (`/settings/members`)

1. Click "Invitar"
2. Email + role (admin/staff/finance/viewer)
3. Mensaje custom opcional
4. Te muestra un link `inv_XXX` para copiar y compartir
5. La persona hace login (o se registra) y acepta

### Roles disponibles

| Rol | Permisos |
|---|---|
| **Owner** | Acceso total. Único e inmutable. |
| **Admin** | Casi todo. Puede invitar, settings, billing. |
| **Staff** | CRM, proyectos, galerías, tareas. Sin settings. |
| **Finance** | Solo finanzas, facturas, reportes. Sin CRM. |
| **Viewer** | Solo lectura. |

### Tareas

`/tasks` — Asigna tareas a tu equipo con:
- Título + descripción
- Asignado a (de los members)
- Due date + hora opcional
- Reminder (15min, 30min, 1h, 2h, 1d, 2d antes)
- Prioridad (urgent, high, medium, low)
- Tags
- Vínculo opcional a cliente/proyecto/factura/booking

### Notificaciones

Al asignar/reasignar, el asignado recibe notification in-app. Si tiene
`reminder_minutes_before` configurado, el cron envía un segundo recordatorio.

### Tareas recurrentes

Marca "Tarea recurrente" + intervalo (diario/semanal/mensual/etc).
Al completar, automáticamente se crea la siguiente iteración.

---

## 10. Chat interno

`/chat` — Slack-like para tu studio.

### Canales

- `#general` (todos los miembros)
- Canales de grupo (subset custom)
- DMs (1:1)
- Canales de proyecto (auto-vinculados a project_id)

### Mensajes

- Markdown básico
- Reactions emoji (👍 ❤️ 🎉 😂 👀 ✅) on hover
- Edit/delete (solo el autor)
- Replies / threads
- Mentions @{user} → la persona recibe notification

### Indicators

- Avatar inicial coloreado por user
- "(editado)" si fue modificado
- Last read tracker per-user

---

## 11. Automatizaciones

`/automations` — workflows que se disparan automáticamente cuando ocurre un evento.

### Eventos disponibles (triggers)

- `client.created` — cliente nuevo
- `project.created` / `project.status_changed` / `project.completed`
- `invoice.sent` / `invoice.paid`
- `booking.received` — solicitud de reserva del portal
- `inv_loan.created` / `inv_loan.returned`
- `inv_rental.completed`
- `gallery.published`
- `contract.signed`

### Acciones disponibles

- **Enviar notificación in-app** al studio owner
- **Crear tarea** (con due_offset_days desde event_date)
- **Actualizar status de proyecto** (intent: edicion, entregado, etc.)
- **Agregar tag** al cliente/proyecto
- **Enviar email** (stub V1 — V2 conectará con email_queue)

### Ejemplo: welcome a clientes nuevos

```json
{
  "trigger_event": "client.created",
  "action_kind": "send_notification",
  "action_config": {
    "title": "Cliente nuevo registrado",
    "body": "Recuerda enviarle el welcome email en las próximas 24h",
    "severity": "info"
  }
}
```

### Filtros

`trigger_filters` JSON para condicionar:

```json
{"event_type": "boda"}  // solo bodas
{"min_amount": 5000}    // solo invoices >= 5000 (no implementado V1)
```

### Historial

Cada regla tiene log de runs en `/automations/[id]` con:
- Status (success/failed/skipped)
- Duración en ms
- Result JSON (qué hizo)
- Error message si falló

---

## 12. Plantillas de proyecto

`Configuración → Plantillas de proyecto` (`/settings/project-templates`)

Define workflows reutilizables por tipo de evento (boda, quince, sesión...).

### Cada plantilla incluye:

- **Tasks default** con `due_offset_days` relativo a event_date
- **Email triggers** (booked, week_before, day_before, after_session)
- **Deliverables** (gallery, álbum, video, prints) con due_offset
- **Packages sugeridos**
- **Pricing default** (base + deposit)

### Aplicar a un proyecto

Al crear un proyecto, selecciona plantilla → se clonan automáticamente
todas las tasks con due_dates calculados desde `event_date`.

### Ejemplo: Boda completa

```json
{
  "tasks": [
    {"title": "Confirmar fecha + lugar", "due_offset_days": -60, "priority": "high"},
    {"title": "Recibir depósito", "due_offset_days": -30, "priority": "urgent"},
    {"title": "Día del evento", "due_offset_days": 0, "priority": "urgent"},
    {"title": "Entregar preview cliente", "due_offset_days": 14, "priority": "medium"}
  ]
}
```

---

## 13. API + Webhooks (avanzado)

### API REST v1

`Configuración → API y tokens` (`/settings/api`) — requiere plan Studio+.

1. Crea un token con scope (read/write/admin)
2. Lo ves **una sola vez** — guárdalo
3. Úsalo en el header:

```bash
curl https://my.abbypixel.com/api/v1/clients \
  -H "Authorization: Bearer sf_XXXXXXXXXXXX"
```

Endpoints disponibles:
- `GET /api/v1/clients` (scope: read)
- `POST /api/v1/clients` (scope: write)
- `GET /api/v1/projects` + `POST`
- `GET /api/v1/invoices`
- `GET /api/v1/payments`
- `GET /api/v1/tasks` + `POST`
- `GET /api/v1/health` (sin auth)

### Webhooks salientes

`Configuración → Webhooks salientes` (`/settings/webhooks`)

1. Click "Nuevo webhook"
2. URL HTTPS (puede ser Zapier, n8n, tu backend)
3. Selecciona eventos (client.created, invoice.paid, etc.)
4. Te genera un secret `whsec_XXX` para validar HMAC

Cada delivery se firma con `X-StudioFlow-Signature: sha256=<hex>`:

```js
const signature = req.headers["x-studioflow-signature"]?.replace("sha256=", "")
const expected = crypto.createHmac("sha256", WEBHOOK_SECRET)
  .update(rawBody).digest("hex")
if (signature !== expected) return res.status(401)
```

### Retries

Si tu endpoint devuelve 4xx/5xx, el cron retentivo:
- Attempt 2: 5 min después
- Attempt 3: 30 min después
- Attempt 4: 4 horas después
- Attempt 5: 24 horas después

Después de 10 fallos consecutivos, el webhook se **auto-desactiva**.

---

## 14. Seguridad: 2FA

`Configuración → Seguridad` (`/settings/security`)

### Activar 2FA TOTP

1. Click "Activar 2FA"
2. Escanea el QR con Google Authenticator / 1Password / Authy
3. Ingresa el código de 6 dígitos
4. **GUARDA los 10 recovery codes** (single-use) en un lugar seguro

### Si pierdes tu dispositivo

Usa un recovery code en el login. Cada uno funciona una sola vez.

### Regenerar recovery codes

Si gastaste varios, regenera 10 nuevos. Los anteriores quedan invalidados.

### Desactivar 2FA

Requiere código TOTP actual o un recovery code.

---

## 15. Plan y facturación SaaS

`Configuración → Plan y facturación` (`/settings/billing`)

### Planes

- **Free**: 25 clientes, 1 user, 1GB, módulos básicos
- **Pro** ($19/mes): 250 clientes, 3 users, 50GB, custom domain, white-label
- **Studio** ($49/mes): ∞ clientes, 10 users, 250GB, API, automations
- **Agency** ($149/mes): todo ilimitado + branding completo

### Upgrade

Click "Cambiar a Studio" → Stripe Checkout (toggle monthly/yearly con -17% off).

### Customer Portal

Botón "Gestionar facturación" abre Stripe Customer Portal donde puedes:
- Cambiar método de pago
- Cancelar suscripción
- Descargar invoices históricos
- Actualizar tax info

### Historial

Lista de invoices Stripe con link al hosted invoice URL.

---

## 16. FAQ y solución de problemas

### "No puedo enviar emails desde Mailcow"

1. Verifica IMAP/SMTP credentials en `/settings/mail` → click "Test connection"
2. Si falla, revisa que el firewall del VPS permita puertos 587 + 993 outbound
3. Si Mailcow rechaza con "relay denied", verifica que la IP del studioflow VPS
   esté en la whitelist de Mailcow

### "El cron no procesa subscriptions"

Verifica que el cron diario esté configurado (ver
`docs/DEPLOYMENT-CHECKLIST.md` paso 6). Trigger manual:

```bash
curl -X POST -H "Authorization: Bearer $FINANCE_CRON_TOKEN" \
  https://my.abbypixel.com/api/cron/finance-jobs
```

### "Google Calendar no sincroniza"

1. Verifica que la integration esté activa en `/settings/integrations/google`
2. Verifica que hayas seleccionado un calendar como destino
3. El watch puede haber expirado (max 7 días) — click "Re-registrar watch"
4. Si nada funciona, desconecta y reconecta desde cero

### "El cliente no puede acceder al portal"

1. Verifica que el cliente tenga `email` configurado
2. Re-envía el código: en detalle del cliente → "Re-enviar acceso portal"
3. El cliente entra a `portal.tuestudio.com` (o `my.abbypixel.com/portal`) con
   su email + código de 6 dígitos

### "No veo las opciones de plan Pro"

Estás en plan Free. Algunas features (custom_domain, white_label, API) están
**gated** por plan. Upgrade en `/settings/billing`.

### "Quiero personalizar más"

- Logos/colores: `/settings/branding`
- Plantillas de email: `/settings/emails/templates`
- Plantillas de contrato: `/settings/contracts`
- Plantillas de proyecto: `/settings/project-templates`
- Workflows automáticos: `/automations`

Todo es **editable** sin tocar código.

### "Quiero exportar mi data"

- Clientes/proyectos/facturas: API v1 (paginado)
- Reportes: CSV desde `/reports`
- Full backup: contacta soporte (V2 — endpoint dedicado próximamente)

### Contacto

📧 Soporte: `soporte@abbypixel.com`
💬 Chat: bottom-right del dashboard (V2)
📚 Docs técnicas: `https://github.com/AbdielPena/CRM-Client-Fotografia` (privado)

---

## Atajos de teclado (V2 planeado)

| Tecla | Acción |
|---|---|
| `g d` | Ir a Dashboard |
| `g c` | Ir a Clientes |
| `g p` | Ir a Proyectos |
| `g i` | Ir a Facturas |
| `g t` | Ir a Tareas |
| `g m` | Ir a Mail |
| `n` | Crear nuevo (contextual) |
| `/` | Buscar |
| `?` | Mostrar atajos |

---

¡Feliz creación! 📸✨

— El equipo de StudioFlow
