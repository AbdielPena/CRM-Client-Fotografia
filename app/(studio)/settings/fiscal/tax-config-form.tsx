"use client"

import { useFormState, useFormStatus } from "react-dom"
import { CheckCircle2, AlertCircle, Save, Loader2 } from "lucide-react"

import { upsertTaxConfigAction, type FiscalActionState } from "@/server/actions/fiscal-ncf.actions"
import { NCF_TYPE_LABELS, NCF_TYPES, type NcfType } from "@/lib/fiscal"
import { Button } from "@/components/ui/button"

type Initial = {
  itbisRate: number
  isrRetention?: number
  rnc: string
  businessName: string
  defaultNcfType: NcfType
}

const initialState: FiscalActionState = {}

export function TaxConfigForm({ initial }: { initial: Initial }) {
  const [state, formAction] = useFormState(upsertTaxConfigAction, initialState)

  return (
    <form action={formAction} className="space-y-4">
      {state.ok && (
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Razón social" name="businessName" required defaultValue={initial.businessName} placeholder="Estudio Fotográfico XYZ S.R.L." errors={state.fieldErrors?.businessName} />
        <Field label="RNC / Cédula" name="rnc" defaultValue={initial.rnc} placeholder="101000001 (9 dig) o 00100000001 (11)" errors={state.fieldErrors?.rnc} hint="Solo dígitos. 9 = RNC empresa, 11 = cédula." />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            ITBIS rate <span className="text-red-500">*</span>
          </label>
          <select
            name="itbisRate"
            defaultValue={String(initial.itbisRate)}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="18">18% (general)</option>
            <option value="16">16% (reducida)</option>
            <option value="0">0% (exento)</option>
          </select>
          {state.fieldErrors?.itbisRate?.[0] && (
            <p className="mt-1 text-[10px] text-red-600">{state.fieldErrors.itbisRate[0]}</p>
          )}
        </div>

        <Field
          type="number"
          label="Retención ISR (%)"
          name="isrRetention"
          defaultValue={initial.isrRetention?.toString()}
          placeholder="Opcional"
          step="0.01"
          min="0"
          max="99.99"
          errors={state.fieldErrors?.isrRetention}
        />

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Tipo NCF por defecto
          </label>
          <select
            name="defaultNcfType"
            defaultValue={initial.defaultNcfType}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {NCF_TYPES.map((t) => (
              <option key={t} value={t}>
                {t} — {NCF_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Se usa cuando emites una factura sin especificar tipo.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
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
        <Loader2 className="mr-1 size-4 animate-spin" />
      ) : (
        <Save className="mr-1 size-4" />
      )}
      {pending ? "Guardando..." : "Guardar configuración"}
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
  max,
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
  max?: string
  errors?: string[]
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
        className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {hint && !errors?.[0] && (
        <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
      )}
      {errors?.[0] && <p className="mt-1 text-[10px] text-red-600">{errors[0]}</p>}
    </div>
  )
}
