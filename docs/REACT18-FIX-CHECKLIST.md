# React 18 — useActionState → useFormState refactor checklist

## Contexto

El proyecto usa React 18 (`"react": "^18"` en package.json). En esta versión
`useActionState` NO existe — es API de React 19. Hay que usar
`useFormState` + `useFormStatus` desde `react-dom`.

**Ya aplicado en `claude/pensive-cerf-2592e8`** (3 archivos). Las otras
branches tienen el mismo issue en otros forms.

## Patrón de refactor

### Antes (React 19 — roto en React 18)

```tsx
import { useActionState } from "react"

export function MyForm() {
  const [state, action, pending] = useActionState(myAction, initialState)

  return (
    <form action={action}>
      <input name="email" />
      <Button disabled={pending}>
        {pending ? "Enviando..." : "Enviar"}
      </Button>
    </form>
  )
}
```

### Después (React 18)

```tsx
import { useFormState, useFormStatus } from "react-dom"

export function MyForm() {
  const [state, action] = useFormState(myAction, initialState)

  return (
    <form action={action}>
      <input name="email" />
      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button disabled={pending}>
      {pending ? "Enviando..." : "Enviar"}
    </Button>
  )
}
```

3 cambios:
1. **Import**: `useActionState` from `"react"` → `useFormState, useFormStatus` from `"react-dom"`
2. **Destructuring**: `[state, action, pending]` → `[state, action]` (pending sale)
3. **Submit button**: extraer a sub-component que usa `useFormStatus()`

## Archivos a refactorear por branch

### claude/pensive-cerf-2592e8 ✅ HECHO

- `app/(studio)/tasks/new/new-task-form.tsx`
- `app/(studio)/settings/branding/branding-form.tsx`
- `app/(studio)/automations/new/new-automation-form.tsx`

### claude/f3-inventory-schema (8 archivos)

- `app/(studio)/inventory/items/new/new-item-form.tsx`
- `app/(studio)/inventory/items/[id]/units/new/new-unit-form.tsx`
- `app/(studio)/inventory/loans/new/new-loan-form.tsx`
- `app/(studio)/inventory/maintenance/new/new-maintenance-form.tsx`
- `app/(studio)/inventory/maintenance/[id]/complete-maintenance-form.tsx`
- `app/(studio)/inventory/rentals/new/new-rental-form.tsx`
- `app/(studio)/inventory/rentals/[id]/record-payment-form.tsx`
- `app/(studio)/inventory/reservations/new/new-reservation-form.tsx`

### claude/f4-fiscal-ncf-integration (2 archivos)

- `app/(studio)/settings/fiscal/ncf-sequence-form.tsx`
- `app/(studio)/settings/fiscal/tax-config-form.tsx`

### claude/f5-finance-schema (14 archivos)

- `app/(studio)/finance/accounts/new/new-account-form.tsx`
- `app/(studio)/finance/debts/new/page.tsx`
- `app/(studio)/finance/debts/[id]/payment-form.tsx`
- `app/(studio)/finance/goals/new/page.tsx`
- `app/(studio)/finance/goals/[id]/contribution-form.tsx`
- `app/(studio)/finance/loans/new/page.tsx`
- `app/(studio)/finance/loans/[id]/payment-form.tsx`
- `app/(studio)/finance/payables/new/new-payable-form.tsx`
- `app/(studio)/finance/payables/[id]/record-payment-form.tsx`
- `app/(studio)/finance/receivables/new/new-receivable-form.tsx`
- `app/(studio)/finance/receivables/[id]/record-payment-form.tsx`
- `app/(studio)/finance/subscriptions/new/new-subscription-form.tsx`
- `app/(studio)/finance/tithe/compute-tithe-button.tsx`
- `app/(studio)/finance/tithe/[id]/mark-paid-form.tsx`

### claude/f6-mail-schema (3 archivos)

- `app/(studio)/mail/compose/compose-form.tsx`
- `app/(studio)/mail/threads/[id]/reply-form.tsx`
- `app/(studio)/settings/mail/new-mail-account-form.tsx`

**Total**: 30 forms en otras branches.

## Cómo aplicar el fix

### Opción A: Manual por archivo (recomendado para reviews)

Por cada archivo:

```bash
git checkout claude/f3-inventory-schema
# ... aplicar las 3 ediciones (import + destructuring + SubmitButton) ...
git commit -m "fix(react18): useActionState → useFormState"
git push
```

### Opción B: Script sed automatizado

```bash
# CUIDADO: solo aplica el cambio del import + destructuring.
# El SubmitButton split requiere edit manual por la estructura única
# de cada form.

cd studioflow
git checkout claude/f3-inventory-schema

# Cambio 1: import
find app -name "*.tsx" -exec sed -i \
  's|import { useActionState, useState } from "react"|import { useState } from "react"\nimport { useFormState, useFormStatus } from "react-dom"|g' {} \;

find app -name "*.tsx" -exec sed -i \
  's|import { useActionState } from "react"|import { useFormState, useFormStatus } from "react-dom"|g' {} \;

# Cambio 2: destructuring (CUIDADO con whitespace)
find app -name "*.tsx" -exec sed -i \
  's|\[state, action, pending\] = useActionState|[state, action] = useFormState|g' {} \;

# Verificar
npx tsc --noEmit
# Después: arreglar los pending references manualmente con SubmitButton
```

### Opción C: Upgrade a React 19 (NO recomendado V1)

```bash
npm install react@19 react-dom@19
```

⚠️ React 19 puede tener breaking changes en otras dependencias (framer-motion,
shadcn/ui). Mejor mantener React 18 y aplicar el fix.

## Alternativa: helper compat

Si quieres una migración menos invasiva, crear:

```ts
// lib/react-compat.ts
"use client"
import { useFormState as _useFormState } from "react-dom"
import { useTransition } from "react"

/**
 * Polyfill de useActionState (React 19) para React 18.
 *
 * IMPORTANTE: NO funciona con server actions directos en <form action={X}>
 * porque el wrap rompe la serialización. Solo úsalo para client actions o
 * envuelve el form con onSubmit manual.
 */
export function useActionState<S>(
  action: (state: S, formData: FormData) => Promise<S>,
  initial: S,
): [S, (formData: FormData) => void, boolean] {
  const [state, formAction] = _useFormState(action, initial)
  const [isPending, startTransition] = useTransition()

  const wrappedAction = (formData: FormData) => {
    startTransition(() => formAction(formData))
  }

  return [state, wrappedAction, isPending]
}
```

⚠️ **Limitación**: este helper rompe el patrón `<form action={X}>` con server
actions. Solo funciona con `<form onSubmit={...}>` + llamada manual. Por eso
el refactor de SubmitButton es la solución correcta.

## Verificación post-fix

```bash
# En cada branch refactoreada
npx tsc --noEmit             # debe pasar
npm run build                # debe completar (con env vars)
grep -rln "useActionState" app/  # debe devolver solo /(auth)/actions.ts (comentario)
```

## Timing estimado

- Por archivo: ~3 min (refactor + verificación)
- F3 (8 archivos): ~25 min
- F4 (2 archivos): ~10 min
- F5 (14 archivos): ~45 min
- F6 (3 archivos): ~10 min

**Total: ~90 min** para refactorear las 4 branches.

Recomendación: hacer el fix al **mergear** cada branch a main (resolver en
el merge commit) en vez de en cada branch separada.
