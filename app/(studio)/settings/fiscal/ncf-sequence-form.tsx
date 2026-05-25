"use client"

import { useFormState, useFormStatus } from "react-dom"
import { CheckCircle2, AlertCircle, Plus, Loader2 } from "lucide-react"

import { createNcfSequenceAction, type FiscalActionState } from "@/server/actions/fiscal-ncf.actions"
import { NCF_TYPE_LABELS, type NcfType } from "@/lib/fiscal"
import { Button } from "@/components/ui/button"

const initialState: FiscalActionState = {}

export function NcfSequenceForm({ availableTypes }: { availableTypes: NcfType[] }) {
  const [state, formAction] = useFormState(createNcfSequenceAction, initialState)

  if (availableTypes.length === 0) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
        Ya tienes secuencias activas para los 11 tipos NCF. Pausa o agota alguna
        existente antes de crear otra.
      </p>
    )
  }

  return (
    <form action={formAction} className="space-y-3">
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Tipo NCF <span className="text-red-500">*</span>
          </label>
          <select
            name="type"
            required
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            defaultValue={availableTypes[0]}
          >
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t} — {NCF_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <NumField label="Desde" name="rangeFrom" required placeholder="1" errors={state.fieldErrors?.rangeFrom} />
        <NumField label="Hasta" name="rangeTo" required placeholder="1000" errors={state.fieldErrors?.rangeTo} />

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Vence (opcional)
          </label>
          <input
            type="date"
            name="expiresAt"
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">
          Notas (opcional)
        </label>
        <input
          type="text"
          name="notes"
          placeholder="Ej: Lote DGII enero 2026, autorización #..."
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
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
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 className="mr-1 size-4 animate-spin" />
      ) : (
        <Plus className="mr-1 size-4" />
      )}
      {pending ? "Creando..." : "Crear secuencia"}
    </Button>
  )
}

function NumField({
  label,
  name,
  required,
  placeholder,
  errors,
}: {
  label: string
  name: string
  required?: boolean
  placeholder?: string
  errors?: string[]
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type="number"
        name={name}
        required={required}
        placeholder={placeholder}
        min="1"
        max="99999999"
        className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {errors?.[0] && <p className="mt-1 text-[10px] text-red-600">{errors[0]}</p>}
    </div>
  )
}
