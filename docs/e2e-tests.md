# E2E Tests — Playwright

Smoke + flow tests para los principales módulos del monolito.

## Estructura

```
tests/e2e/
├── auth.setup.ts              # Login con E2E_TEST_EMAIL/PASSWORD
├── galleries.spec.ts          # Galería pública (existente)
├── public-gallery.public.spec.ts # Token público (sin auth)
├── modules-overview.spec.ts   # Dashboard cross-módulo (F2 V2)
├── automations.spec.ts        # CRUD automation rules (F2 V2)
├── subscriptions.spec.ts      # Finance subscriptions (F5 V2)
├── mail-tabs.spec.ts          # Mail Inbox/Sent/Drafts (F6 V2)
├── inventory-reservation.spec.ts # Inventory reservas (F3 V2)
└── fiscal-ncf.spec.ts         # Settings fiscal (F4)
```

## Configuración

### Variables de entorno

```bash
E2E_BASE_URL=http://localhost:3000   # o staging URL
E2E_TEST_EMAIL=test@studioflow.dev
E2E_TEST_PASSWORD=<password>
```

### Pre-requisitos

- El studio del test user debe tener al menos 1 cliente y 1 item de
  inventario para que los specs de `inventory-reservation` no se salten
- Para `mail-tabs` se necesita una cuenta Mailcow configurada (los tests
  hacen skip si no hay)
- Para `automations` no se necesita preparación adicional

## Ejecutar

```bash
# Todos (require dev server corriendo o configurar webServer)
npm run test:e2e

# Solo uno
npm run test:e2e -- automations.spec.ts

# Modo interactivo (Playwright UI)
npm run test:e2e:ui

# Solo en chromium (no setup)
npm run test:e2e -- --project=chromium
```

## CI/CD

Los tests corren en GitHub Actions con:
- `forbidOnly: true` (falla si alguien dejó `.only`)
- `retries: 2`
- `workers: 1` (secuencial para evitar race conditions en data shared)
- Reporters: github + html

## Cobertura actual

| Spec | Cobertura | Skip si... |
|---|---|---|
| modules-overview | Dashboard cards + nav links | — |
| automations | Create / pause / delete rule | — |
| subscriptions | Create / pause subscription | — |
| mail-tabs | Tabs nav + compose render | No hay cuenta Mailcow |
| inventory-reservation | Create reserva | No hay items |
| fiscal-ncf | Settings fiscal page | Reportes ruta no existe |
| galleries (existente) | Galería + upload | — |
| public-gallery (existente) | Token + viewer | Sin token |

## Pendiente V3

- Stripe webhook → fin_transactions idempotency
- Invoice paid → automation dispatch
- NCF atomic assignment under concurrency (Promise.all 100x)
- Mail IMAP sync → message ingestion (requiere mock IMAP server)
- Inventory loan → stock_movements ledger
- Cross-modulo: pago invoice → fin_transactions.ingreso + automation
