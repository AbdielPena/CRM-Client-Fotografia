"use client"

import { useActionState } from "react"
import Link from "next/link"
import { ArrowLeft, AlertCircle, Save, Loader2 } from "lucide-react"

import {
  createFinDebtAction,
  type FinActionState,
} from "@/server/actions/fin-debt-loan-goal.actions"
import { Button } from "@/components/ui/button"

const initialState: FinActionState = {}

export default function NewDebtPage() {
  const [state, action, pending] = useActionState(
    createFinDebtAction,
    initialState,
  )

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Finanzas / Deudas
          </p>
          <h1 className="font-display text-2xl">Nueva deuda</h1>
        </div>
        <Link
          href="/finance/debts"
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

        <Field
          label="Acreedor"
          name="acreedor"
          required
          placeholder="Banco, financiera, persona..."
          defaultValue={state.values?.acreedor}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            type="number"
            label="Monto original"
            name="montoOriginal"
            required
            step="0.01"
            min="0.01"
            placeholder="0.00"
            defaultValue={state.values?.montoOriginal}
          />
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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            type="number"
            label="Cuotas totales"
            name="cuotasTotal"
            placeholder="12"
            defaultValue={state.values?.cuotasTotal}
            hint="Opcional"
          />
          <Field
            type="number"
            label="Monto cuota"
            name="montoCuota"
            step="0.01"
            placeholder="500.00"
            defaultValue={state.values?.montoCuota}
            hint="Opcional"
          />
          <Field
            type="number"
            label="Tasa interés %"
            name="tasaInteres"
            step="0.01"
            min="0"
            max="99.99"
            placeholder="12.50"
            defaultValue={state.values?.tasaInteres}
            hint="Informativa"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            type="date"
            label="Fecha inicio"
            name="fechaInicio"
            defaultValue={state.values?.fechaInicio}
          />
          <Field
            type="date"
            label="Próximo pago"
            name="fechaProximoPago"
            defaultValue={state.values?.fechaProximoPago}
          />
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
                Crear deuda
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  name,
  required,
  type = "text",
  step,
  min,
  max,
  placeholder,
  hint,
  defaultValue,
}: {
  label: string
  name: string
  required?: boolean
  type?: string
  step?: string
  min?: string
  max?: string
  placeholder?: string
  hint?: string
  defaultValue?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {hint && (
        <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
