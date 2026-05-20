"use client"

import { useActionState } from "react"
import Link from "next/link"
import { ArrowLeft, AlertCircle, Save, Loader2 } from "lucide-react"

import {
  createFinLoanAction,
  type FinActionState,
} from "@/server/actions/fin-debt-loan-goal.actions"
import { Button } from "@/components/ui/button"

const initialState: FinActionState = {}

export default function NewLoanPage() {
  const [state, action, pending] = useActionState(
    createFinLoanAction,
    initialState,
  )

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Finanzas / Préstamos
          </p>
          <h1 className="font-display text-2xl">Nuevo préstamo otorgado</h1>
          <p className="text-xs text-muted-foreground">
            Dinero que tú prestaste a alguien.
          </p>
        </div>
        <Link
          href="/finance/loans"
          className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-4" />
          Cancelar
        </Link>
      </div>

      <form action={action} className="sf-card space-y-5 p-6">
        {state.ok === false && state.message && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="size-4" />
            {state.message}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium">
            Deudor <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="deudor"
            required
            placeholder="A quién le prestaste"
            defaultValue={state.values?.deudor}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Monto <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="montoOriginal"
              required
              step="0.01"
              min="0.01"
              placeholder="0.00"
              defaultValue={state.values?.montoOriginal}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Moneda</label>
            <select
              name="currency"
              defaultValue={state.values?.currency ?? "DOP"}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="DOP">DOP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Fecha</label>
            <input
              type="date"
              name="fechaInicio"
              defaultValue={
                state.values?.fechaInicio ?? new Date().toISOString().slice(0, 10)
              }
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium">
            Cuenta de salida (opcional)
          </label>
          <input
            type="text"
            name="cuentaSalida"
            placeholder="UUID de la cuenta Finance"
            defaultValue={state.values?.cuentaSalida}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Si vinculas cuenta, crea fin_transactions.gasto inicial.
          </p>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-1 size-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="mr-1 size-4" />
                Registrar préstamo
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
