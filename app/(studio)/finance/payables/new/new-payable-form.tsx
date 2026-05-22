"use client"

import { useFormState, useFormStatus } from "react-dom"
import { AlertCircle, Save, Loader2 } from "lucide-react"

import {
  createFinPayableAction,
  type FinPayableActionState,
} from "@/server/actions/fin-payable.actions"
import { Button } from "@/components/ui/button"

const initialState: FinPayableActionState = {}

export function NewPayableForm() {
  const [state, action] = useFormState(
    createFinPayableAction,
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

      <div>
        <label className="mb-1.5 block text-xs font-medium">
          Acreedor <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="acreedor"
          required
          placeholder="Proveedor, freelancer, etc."
          defaultValue={state.values?.acreedor}
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {state.fieldErrors?.acreedor?.[0] && (
          <p className="mt-1 text-[10px] text-red-600">{state.fieldErrors.acreedor[0]}</p>
        )}
      </div>

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
            placeholder="0.00"
            defaultValue={state.values?.monto}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
          <label className="mb-1.5 block text-xs font-medium">Fecha vencimiento</label>
          <input
            type="date"
            name="fechaVenc"
            defaultValue={state.values?.fechaVenc}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium">Notas</label>
        <textarea
          name="notas"
          rows={3}
          placeholder="Descripción, referencia, términos..."
          defaultValue={state.values?.notas}
          className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-1 size-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-1 size-4" />
              Crear CxP
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
