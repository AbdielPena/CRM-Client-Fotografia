"use client"

import { useFormState, useFormStatus } from "react-dom"
import { AlertCircle, CheckCircle2, Save, Loader2 } from "lucide-react"

import {
  recordRentalPaymentAction,
  type InvRentalActionState,
} from "@/server/actions/inv-rental.actions"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils/currency"

type Account = {
  id: string
  nombre: string
  currency: string
  balance: number
}

const initialState: InvRentalActionState = {}

export function RecordRentalPaymentForm({
  rentalId,
  pendingAmount,
  accounts,
}: {
  rentalId: string
  pendingAmount: number
  accounts: Account[]
}) {
  const [state, action] = useFormState(
    recordRentalPaymentAction,
    initialState,
  )

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="rentalId" value={rentalId} />

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
            Máx: {formatCurrency(pendingAmount)}
          </p>
          {state.fieldErrors?.monto?.[0] && (
            <p className="mt-1 text-[10px] text-red-600">
              {state.fieldErrors.monto[0]}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Método <span className="text-red-500">*</span>
          </label>
          <select
            name="method"
            required
            defaultValue={state.values?.method ?? "efectivo"}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
            <option value="cheque">Cheque</option>
            <option value="deposito">Depósito</option>
            <option value="otro">Otro</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Fecha pago
          </label>
          <input
            type="datetime-local"
            name="paidAt"
            defaultValue={
              state.values?.paidAt ?? new Date().toISOString().slice(0, 16)
            }
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Cuenta destino (Finance)
          </label>
          <select
            name="finAccountId"
            defaultValue={state.values?.finAccountId ?? ""}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">— Sin vincular —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre} ({formatCurrency(a.balance, a.currency)})
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Si vinculas, crea fin_transactions.ingreso atómico.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Referencia
          </label>
          <input
            type="text"
            name="reference"
            defaultValue={state.values?.reference}
            placeholder="N° cheque, voucher, etc."
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">
          Notas
        </label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={state.values?.notes}
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
