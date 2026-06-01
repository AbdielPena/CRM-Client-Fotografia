# Booking Flow Rework — Plan + Estado

> Rework del flujo completo de booking para que siga la lógica de negocio correcta.
> **Estrategia de deploy**: TODO se implementa en la branch `claude/pensive-cerf-2592e8`
> y se deploya COMPLETO al final. Producción no se rompe a medias.
> Cambios de DB se aplican aditivos/backward-compatible (el código viejo en prod sigue
> funcionando hasta el deploy final).

## Flujo objetivo (validado con el dueño)

```
1. Cliente abre /p/<studio>/<paquete>
2. Llena formulario de SOLICITUD            → booking_request status: pending_review
3. Le llega al admin (/bookings)
4. Admin APRUEBA                            → status: approved
   · crea cliente + proyecto + contrato(draft) + formulario asignado
   · SIN factura
   · manda al cliente LINK DE CONFIRMACIÓN (no firma directa)
5. Cliente abre link → "Continuar"
6. Revé el plan seleccionado + qué incluye
7. Completa FORMULARIO FINAL (default_form_template_id del paquete)
8. Firma el CONTRATO
9. Al firmar → se genera 1 FACTURA del total → "paga para confirmar"  → status: awaiting_payment
10. Booking en HOLD (awaiting_payment). Google Calendar: evento TENTATIVO
11. Admin registra Pago 1 y luego Pago 2 DENTRO DE LA MISMA factura.
    Cada registro/cambio NOTIFICA al cliente (email + portal).
12. Al confirmar pago → status: confirmed
    · Google Calendar evento → CONFIRMADO
    · booking ↔ contrato ↔ factura ↔ cliente vinculados, sin duplicados
```

### Decisiones de negocio
- **Al aprobar**: cliente + proyecto + contrato + formulario. Factura SOLO tras firmar.
- **1 sola factura** digital modificable, con Pago 1 + Pago 2 dentro de ella. Cada cambio notifica al cliente.
- **Formulario** = `packages.default_form_template_id`.
- **Calendar**: tentativo al aprobar → confirmado al pagar.
- **Booking test**: resetear para probar el flujo nuevo desde cero.

## Estado actual del código (hallazgos del análisis)

- State machine `lib/state-machines/booking-request.ts:18-30` YA tiene los estados correctos
  (`pending_review→approved→awaiting_payment→confirmed→scheduled→completed`) pero las
  transiciones a `awaiting_payment`/`confirmed` NO estaban implementadas (solo se usaba `approved`).
- `approveBookingRequest` (server/services/booking-request.service.ts:628-822): creaba
  cliente+proyecto+contrato + **2 facturas** vía RPC `create_client_with_booking`, y mandaba
  email con link DIRECTO a `/sign/<token>`.
- Cliente: `/p/<studio>/<pkg>` → `/book` → `/book/success`. NO existe página intermedia
  confirmar→continuar→revisar→formulario. `/f/<token>` (formulario) existe pero DESCONECTADO.
  `/sign/<token>` firma OK. `/i/<id>` factura pública OK.
- Pago: `recordPaymentAction`→`markInvoicePaid` inserta en `payments` (permite N pagos),
  trigger `apply_payment_to_invoice` actualiza `invoice.status`. NO transiciona el booking.
  `payments` SIN unique constraint → riesgo duplicados. Template "payment_received" existe
  pero el email NO se dispara automático.
- Google Calendar (`server/services/google-calendar.service.ts`): requiere OAuth
  (GOOGLE_CLIENT_ID). Evento SIEMPRE `status:'confirmed'` (no soporta tentativo). Best-effort.
  `google_events` dedup vía upsert en (studio_id, google_event_id).

## Fases

### ✅ Fase A — Backend de estados (HECHO, en branch, sin deploy)
- [x] Migración `booking_rpc_skip_invoices_flag`: RPC `create_client_with_booking` acepta
      `skip_invoices` en el payload (aditivo, prod-safe). APLICADA a prod.
- [x] `client.schema.ts`: campo `skipInvoices?: boolean`
- [x] `client.service.ts createClientWithBooking`: pasa `skip_invoices`; return invoice ids nullable
- [x] `booking-request.service.ts convertBookingToClientBundle`: pasa `skipInvoices:true`,
      backlink de facturas condicional, return nullable
- [x] `client.actions.ts`: emailBundle condicional (guard del nullable, flujo manual intacto)

### ✅ Fase B — Flujo del cliente (páginas) (HECHO, branch)
- [x] Página `/b/[token]` (hub): bienvenida + resumen del plan + checklist de pasos
      (formulario → firma → pago) con CTA al paso actual. Usa contract.signing_token.
      `app/b/[token]/page.tsx` + `server/services/booking-flow.service.ts`
- [x] Conecta formulario (`/f/<access_token>`) y firma (`/sign/<token>`) en orden
- [x] `email.service renderBookingApprovedForClient`: botón "Continuar con mi reserva" → `/b/<token>`
- [x] `booking-request.service`: `buildBookingFlowUrl()`, el email apunta a `/b/`
- [x] `middleware.ts`: `/b/` agregado a PUBLIC_PREFIXES

### ✅ Fase C — Factura al firmar (HECHO, branch)
- [x] RPC `generate_booking_invoice(studio, project)` idempotente: 1 factura del total,
      installment_total=2, status 'sent'. No duplica. (migración aplicada a prod)
- [x] `contract-post-sign.service onContractSigned`: cuando firma el CLIENTE → genera
      factura (RPC) + transición booking `approved→awaiting_payment` + email factura
- [x] El hub `/b/<token>` muestra el paso "Realiza el pago" con link a `/i/<id>` tras firmar

### 🟡 Fase D — Pagos + notificación (PARCIAL, branch)
- [x] Notifica al cliente "sesión confirmada" al recibir el primer pago
      (en confirmBookingAfterPayment)
- [ ] PENDIENTE: notificar al cliente en CADA pago registrado (no solo el primero)
- [ ] PENDIENTE: unique/idempotency_key en `payments` (riesgo bajo — registro manual)
- [ ] PENDIENTE: factura editable (montos/info) con notificación al cliente del cambio

### ✅ Fase E — Confirmar pago → confirmed + Google Calendar (HECHO núcleo, branch)
- [x] `onPaymentRecorded` (project-automation.service): 1er pago → `confirmBookingAfterPayment`
      → booking `awaiting_payment/approved → confirmed` (idempotente)
- [x] `confirmProjectCalendarEvent` (google-calendar.service): evento local → 'confirmed' +
      resync best-effort a Google (degrada sin OAuth)
- [ ] PENDIENTE (mejora): evento TENTATIVO al aprobar (hoy se crea 'confirmed' siempre).
      Requiere parametrizar la creación + OAuth Google configurado.

### ✅ Fase F — Visibilidad del paso (HECHO, branch)
- [x] StatusBadge YA mapea pending_review/approved/awaiting_payment/confirmed/scheduled
      con labels ES + colores. Como ahora los estados se USAN de verdad, el admin ve
      el progreso real en /bookings y /bookings/[id].
- [x] Idempotencia del flujo: conversion lock (approve) + generate_booking_invoice
      idempotente + confirmBookingAfterPayment idempotente + google_events upsert.
- [ ] PENDIENTE (mejora): auditar doble-pago manual (idempotency_key)

## Deploy (al final)
1. Build local/VPS limpio (typecheck) en la branch
2. Resetear booking de prueba del dueño
3. Probar flujo end-to-end con cuenta TEST (elabdiheber@gmail.com / studio "Abby Pixel TEST")
4. Merge a main + push → deploy VPS
5. Smoke test en my.abbypixel.com

## Notas técnicas
- RPC `create_client_with_booking` vive solo en la DB (heredada del monolito). La definición
  con el flag skip_invoices está versionada en la migración `booking_rpc_skip_invoices_flag`.
- El flujo MANUAL del CRM (createClientAction) sigue creando 2 facturas — NO se tocó su comportamiento.
