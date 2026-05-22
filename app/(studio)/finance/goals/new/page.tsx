"use client"

import { useFormState, useFormStatus } from "react-dom"
import Link from "next/link"
import { ArrowLeft, AlertCircle, Save, Loader2, Target } from "lucide-react"

import {
  createFinGoalAction,
  type FinActionState,
} from "@/server/actions/fin-debt-loan-goal.actions"
import { Button } from "@/components/ui/button"

const initialState: FinActionState = {}

export default function NewGoalPage() {
  const [state, action] = useFormState(
    createFinGoalAction,
    initialState,
  )

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Finanzas / Metas
          </p>
          <h1 className="flex items-center gap-2 font-display text-2xl">
            <Target className="size-6" />
            Nueva meta
          </h1>
          <p className="text-xs text-muted-foreground">
            Define un objetivo de ahorro con fecha objetivo.
          </p>
        </div>
        <Link
          href="/finance/goals"
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
            Nombre de la meta <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="nombre"
            required
            placeholder="Cámara nueva, fondo emergencia, viaje, etc."
            defaultValue={state.values?.nombre}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Monto objetivo <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="montoObjetivo"
              required
              step="0.01"
              min="0.01"
              placeholder="50000.00"
              defaultValue={state.values?.montoObjetivo}
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
            <label className="mb-1.5 block text-xs font-medium">
              Fecha objetivo
            </label>
            <input
              type="date"
              name="fechaObjetivo"
              defaultValue={state.values?.fechaObjetivo}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium">
            Cuenta vinculada (opcional)
          </label>
          <input
            type="text"
            name="cuentaId"
            placeholder="UUID de la cuenta Finance"
            defaultValue={state.values?.cuentaId}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Si vinculas cuenta, su balance contará automáticamente para la meta.
          </p>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <SubmitButton />
        </div>
      </form>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-1 size-4 animate-spin" />
          Guardando...
        </>
      ) : (
        <>
          <Save className="mr-1 size-4" />
          Crear meta
        </>
      )}
    </Button>
  )
}
