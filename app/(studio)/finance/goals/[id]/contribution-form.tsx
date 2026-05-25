"use client"

import { useFormState, useFormStatus } from "react-dom"
import { AlertCircle, CheckCircle2, Save, Loader2 } from "lucide-react"

import {
  addGoalContributionAction,
  type RecordActionState,
} from "@/server/actions/fin-debt.actions"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils/currency"

const initialState: RecordActionState = {}

export function GoalContributionForm({
  goalId,
  remaining,
  currency,
}: {
  goalId: string
  remaining: number
  currency: string
}) {
  const [state, action] = useFormState(
    addGoalContributionAction,
    initialState,
  )

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="goalId" value={goalId} />

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            placeholder={remaining.toFixed(2)}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Falta: {formatCurrency(remaining, currency)}
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
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium">
          ID transacción (opcional)
        </label>
        <input
          type="text"
          name="transactionId"
          placeholder="UUID si quieres vincular a fin_transactions"
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium">Notas</label>
        <textarea
          name="notas"
          rows={2}
          className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex justify-end border-t border-border pt-3">
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
          Agregar aporte
        </>
      )}
    </Button>
  )
}
