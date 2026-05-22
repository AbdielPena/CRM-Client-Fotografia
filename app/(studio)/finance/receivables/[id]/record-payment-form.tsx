"use client"

import { useFormState, useFormStatus } from "react-dom"
import { AlertCircle, CheckCircle2, Save, Loader2 } from "lucide-react"

import {
  recordReceivablePaymentAction,
  type FinReceivableActionState,
} from "@/server/actions/fin-receivable.actions"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils/currency"

type Account = {
  id: string
  nombre: string
  currency: string
  balance: number
}

const initialState: FinReceivableActionState = {}

export function RecordPaymentForm({
  receivableId,
  pendingAmount,
  currency,
  accounts,
}: {
  receivableId: string
  pendingAmount: number
  currency: string
  accounts: Account[]
}) {
  const [state, action] = useFormState(
    recordReceivablePaymentAction,
    initialState,
  )

  // Solo mostrar cuentas en la misma currency
  const compatibleAccounts = accounts.filter((a) => a.currency === currency)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="receivableId" value={receivableId} />

      {state.ok === true && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="size-4" />
          {state.message}
        </div>
      )}
      {state.ok === false && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-4" />
          {state.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Monto <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="monto"
            required
            step="0.01"
            min="0.01"
            max={pendingAmount}
            defaultValue={state.values?.monto ?? pendingAmount.toFixed(2)}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Máx: {formatCurrency(pendingAmount, currency)}
          </p>
          {state.fieldErrors?.monto?.[0] && (
            <p className="mt-1 text-[10px] text-red-600">
              {state.fieldErrors.monto[0]}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Fecha <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            name="fecha"
            required
            defaultValue={
              state.values?.fecha ?? new Date().toISOString().slice(0, 10)
            }
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Cuenta destino (opcional)
          </label>
          <select
            name="cuentaId"
            defaultValue={state.values?.cuentaId ?? ""}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">— Sin vincular —</option>
            {compatibleAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre} ({formatCurrency(a.balance, a.currency)})
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Si vinculas cuenta, crea transacción de ingreso automática.
          </p>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">
          Notas
        </label>
        <textarea
          name="notas"
          rows={2}
          defaultValue={state.values?.notas}
          placeholder="Referencia, método de pago, etc."
          className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
        <SubmitButton />
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-1 size-4 animate-spin" />
          Registrando...
        </>
      ) : (
        <>
          <Save className="mr-1 size-4" />
          Registrar pago
        </>
      )}
    </Button>
  )
}
