"use client"

import { useActionState } from "react"
import { AlertCircle, CheckCircle2, Save, Loader2 } from "lucide-react"

import {
  recordPayablePaymentAction,
  type FinPayableActionState,
} from "@/server/actions/fin-payable.actions"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils/currency"

type Account = {
  id: string
  nombre: string
  currency: string
  balance: number
}

const initialState: FinPayableActionState = {}

export function RecordPayablePaymentForm({
  payableId,
  pendingAmount,
  currency,
  accounts,
}: {
  payableId: string
  pendingAmount: number
  currency: string
  accounts: Account[]
}) {
  const [state, action, pending] = useActionState(
    recordPayablePaymentAction,
    initialState,
  )

  const compatibleAccounts = accounts.filter((a) => a.currency === currency)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="payableId" value={payableId} />

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
          <label className="mb-1.5 block text-xs font-medium">
            Monto <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="monto"
            required
            step="0.01"
            min="0.01"
            max={pendingAmount}
            defaultValue={pendingAmount.toFixed(2)}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Máx: {formatCurrency(pendingAmount, currency)}
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium">
            Fecha <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            name="fecha"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium">
            Cuenta origen (opcional)
          </label>
          <select
            name="cuentaId"
            defaultValue=""
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— Sin vincular —</option>
            {compatibleAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre} ({formatCurrency(a.balance, a.currency)})
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Si vinculas, crea fin_transactions.gasto atómico.
          </p>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium">Notas</label>
        <textarea
          name="notas"
          rows={2}
          placeholder="Referencia, método, etc."
          className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
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
      </div>
    </form>
  )
}
