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

### ⬜ Fase B — Flujo del cliente (páginas)
- [ ] Página `/confirm/[token]` (o `/b/[token]`): "Tu sesión fue aprobada · Continuar"
- [ ] Paso revisar plan (reusar datos del package_snapshot/pricing_snapshot)
- [ ] Conectar formulario final (`default_form_template_id`) → `/f/[token]` o inline
- [ ] Orquestar: confirmar → revisar → formulario → `/sign` (en ese orden)
- [ ] `email.service.ts renderBookingApprovedForClient`: link a `/confirm/<token>` (no `/sign`)
- [ ] Token: ¿reusar contract.signing_token o crear booking_confirmation_token?

### ⬜ Fase C — Factura al firmar
- [ ] RPC `generate_booking_invoice(studio, project)` idempotente: 1 factura del total,
      installment_total=2, status 'sent'. No duplica si ya existe.
- [ ] Hook post-firma (`contract-post-sign.service.ts onContractSigned`): llamar la RPC +
      transición booking `approved→awaiting_payment` + email factura al cliente
- [ ] `/sign` redirige a `/i/<id>` tras firmar ("paga para confirmar")

### ⬜ Fase D — Pagos + notificación
- [ ] Migración: unique parcial anti-duplicado en `payments` (idempotency_key o
      (invoice_id, amount, received_at)) — verificar que no haya dups antes
- [ ] `markInvoicePaid` / `recordPaymentAction`: notificar al cliente (email + portal) en
      cada pago/cambio de factura (template payment_received)
- [ ] Factura modificable: editar montos/info y notificar al cliente del cambio

### ⬜ Fase E — Confirmar pago → confirmed + Google Calendar
- [ ] Lógica: al confirmar pago (depósito) → booking `awaiting_payment→confirmed`
      (¿trigger SQL o en onPaymentRecorded TS?). Decidir: confirma con depósito.
- [ ] Google Calendar: soportar evento TENTATIVO al aprobar → CONFIRMADO al pagar
      (google-calendar.service.ts línea ~526 status hardcoded 'confirmed' → parametrizar)
- [ ] Si no hay OAuth Google: degradar a availability_block interno (ya existe provisional)

### ⬜ Fase F — Anti-duplicados + visibilidad
- [ ] Auditar idempotencia de todo el flujo (aprobar 2x, pagar 2x, firmar 2x)
- [ ] Indicador en /bookings y /bookings/[id] del PASO actual de cada solicitud
      (esperando confirmación cliente / firmado / esperando pago / confirmado)

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
