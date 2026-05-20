# Automations — Eventos y acciones disponibles

Catálogo de triggers y actions soportados en el módulo de Automatizaciones
(`/automations`).

## Triggers disponibles

| Event ID | Cuándo se dispara | Payload típico |
|---|---|---|
| `client.created` | Al crear un cliente nuevo | `{client_id, name, email, source}` |
| `project.created` | Al crear un proyecto | `{project_id, client_id, event_type, event_date}` |
| `project.status_changed` | Cambio de status del proyecto | `{project_id, from, to}` |
| `invoice.sent` | Factura marcada como enviada | `{invoice_id, client_id, total, currency}` |
| `invoice.paid` | Pago completo registrado | `{invoice_id, client_id, total, payment_method}` |
| `booking.received` | Solicitud de reserva recibida del portal | `{booking_id, client_email, event_type}` |
| `inv_loan.created` | Préstamo interno creado | `{loan_id, responsible_id, items_count}` |
| `inv_loan.returned` | Préstamo devuelto | `{loan_id, items_count}` |
| `inv_rental.completed` | Alquiler completado (devolución) | `{rental_id, client_id, total_amount}` |
| `gallery.published` | Galería compartida al cliente | `{gallery_id, client_id, asset_count}` |
| `contract.signed` | Contrato firmado por el cliente | `{contract_id, client_id, project_id}` |

### Filtros del trigger

JSONB que se matchea contra el payload. Cada key debe ser exacta o estar en
el array dado.

**Ejemplos:**

```json
{"event_type": "boda"}
```
→ solo para proyectos de boda.

```json
{"min_amount": 5000}
```
→ ⚠️ no soportado nativamente (requiere comparison). V2.

```json
{"event_type": ["boda", "quince"]}
```
→ trigger matchea si event_type es alguno de los dos.

## Actions disponibles

### `send_notification`

Crea una entrada en `notifications` para el studio owner.

```json
{
  "title": "Cliente nuevo",
  "body": "Se registró un cliente nuevo. Revisa el CRM.",
  "severity": "info"
}
```

Severities: `info`, `warning`, `danger`.

### `add_tag`

Agrega un tag a la entidad que disparó el evento. Crea el tag si no existe.

```json
{
  "tag_name": "vip",
  "tag_color": "#7C3AED"
}
```

### `create_task`

Crea una task en el CRM con due date relativo.

```json
{
  "title": "Llamar al cliente para feedback",
  "description": "Verificar satisfacción con la sesión",
  "due_offset_days": 7,
  "priority": "medium"
}
```

Si la entity es proyecto o cliente, la task queda vinculada automáticamente.

### `update_project_status`

Solo aplica cuando el entity es `project`. Usa el sistema de intents
(`project-automation.service.ts`):

```json
{
  "intent": "edicion"
}
```

Intents válidos: `consulta`, `reservado`, `sesion_realizada`,
`esperando_seleccion`, `edicion`, `entregado`.

El service busca el label de status del studio que matchee el intent y aplica
la transición. Si no hay match, no hace nada (silencioso).

### `send_email` (stub V1)

Define la intención. La integración con `email-queue.service` será en V2.

```json
{
  "template_slug": "welcome",
  "delay_minutes": 0
}
```

El run guarda `intended_recipient + template_slug` pero NO envía. Esto evita
spam mientras se valida el flujo. Cuando la integración con la cola SMTP de
Mailcow esté lista (V2), se cambia a envío real.

## Cómo agregar un nuevo trigger desde código

Cuando creas una nueva mutación importante (ej. nuevo `inv_*` event), llama
al dispatcher después de la operación:

```ts
import { dispatchAutomationEvent } from "@/server/services/automation.service"

// dentro de tu service después de la operación principal
await dispatchAutomationEvent({
  studioId,
  event: "inv_rental.completed",
  entityType: "inv_rental",
  entityId: rental.id,
  payload: {
    client_id: rental.client_id,
    total_amount: rental.total_amount,
  },
})
```

El dispatcher:
1. Lista rules activas con `trigger_event = "inv_rental.completed"`
2. Filtra las que matchen `trigger_filters` contra el payload
3. Ejecuta cada acción en paralelo (Promise.allSettled)
4. Persiste cada run con status + result + duration

Errores en una rule NO bloquean otras.

## Limitaciones V1

- Sin comparison operators en filters (`>`, `<`, `>=`) — solo igualdad
- `send_email` queda como stub hasta integración V2 con email_queue
- Sin throttling — si el mismo event se dispara 100 veces, ejecuta 100 runs
- Sin scheduled actions — todo es síncrono al evento
- Sin retries automáticos en failure

## V2 planeado

- Email real via Mailcow SMTP usando templates de `email_templates`
- Throttling por rule (max N runs/hour)
- Retry con backoff exponencial
- Operators en filters (`>`, `<`, `regex`)
- Cron-based triggers (no solo event-based)
