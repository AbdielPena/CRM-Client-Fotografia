"use client"

import { useFormState, useFormStatus } from "react-dom"
import { AlertCircle, Save, Loader2 } from "lucide-react"

import {
  createFinReceivableAction,
  type FinReceivableActionState,
} from "@/server/actions/fin-receivable.actions"
import { Button } from "@/components/ui/button"

const initialState: FinReceivableActionState = {}

export function NewReceivableForm() {
  const [state, action] = useFormState(
    createFinReceivableAction,
    initialState,
  )

  return (
    <form action={action} className="sf-card space-y-5 p-6">
      {state.ok === false && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-4" />
          {state.message}
        </div>
      )}

      <Field
        label="Nombre del cliente"
        name="cliente"
        required
        placeholder="Juan Pérez / Empresa S.R.L."
        defaultValue={state.values?.cliente}
        errors={state.fieldErrors?.cliente}
        hint="Snapshot del nombre. Si tienes el cliente en el CRM, pega su UUID en el campo opcional abajo."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Client ID del CRM (opcional)"
          name="clientId"
          placeholder="UUID"
          defaultValue={state.values?.clientId}
          errors={state.fieldErrors?.clientId}
          hint="Si está vacío, no se vincula al CRM."
        />
        <Field
          label="Invoice ID del CRM (opcional)"
          name="invoiceId"
          placeholder="UUID"
          defaultValue={state.values?.invoiceId}
          errors={state.fieldErrors?.invoiceId}
          hint="Si la CxC corresponde a una factura sin cobrar."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field
          label="Monto"
          name="monto"
          type="number"
          required
          step="0.01"
          min="0.01"
          placeholder="0.00"
          defaultValue={state.values?.monto}
          errors={state.fieldErrors?.monto}
        />
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Moneda
          </label>
          <select
            name="currency"
            defaultValue={state.values?.currency ?? "DOP"}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="DOP">DOP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <Field
          label="Fecha vencimiento"
          name="fechaVenc"
          type="date"
          defaultValue={state.values?.fechaVenc}
          errors={state.fieldErrors?.fechaVenc}
        />
      </div>

      <Field
        label="Fecha emisión (opcional)"
        name="fechaEmision"
        type="date"
        defaultValue={state.values?.fechaEmision}
      />

      <Field
        label="Notas"
        name="notas"
        textarea
        placeholder="Información adicional, términos de pago, contacto..."
        defaultValue={state.values?.notas}
      />

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
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
          Guardando...
        </>
      ) : (
        <>
          <Save className="mr-1 size-4" />
          Crear CxC
        </>
      )}
    </Button>
  )
}

function Field({
  label,
  name,
  required,
  defaultValue,
  placeholder,
  hint,
  type = "text",
  step,
  min,
  textarea,
  errors,
}: {
  label: string
  name: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
  hint?: string
  type?: string
  step?: string
  min?: string
  textarea?: boolean
  errors?: string[]
}) {
  const cls =
    "block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {textarea ? (
        <textarea
          name={name}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          rows={3}
          className={cls + " resize-y"}
        />
      ) : (
        <input
          type={type}
          name={name}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          step={step}
          min={min}
          className={cls}
        />
      )}
      {hint && !errors?.[0] && (
        <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
      )}
      {errors?.[0] && <p className="mt-1 text-[10px] text-red-600">{errors[0]}</p>}
    </div>
  )
}
