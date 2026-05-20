"use client"

import { useActionState } from "react"
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react"

import {
  completeInvMaintenanceAction,
  type InvMaintActionState,
} from "@/server/actions/inv-maintenance.actions"
import { Button } from "@/components/ui/button"

const initialState: InvMaintActionState = {}

export function CompleteMaintenanceForm({
  maintenanceId,
  defaultCost,
}: {
  maintenanceId: string
  defaultCost: number
}) {
  const [state, action, pending] = useActionState(
    completeInvMaintenanceAction,
    initialState,
  )

  return (
    <section className="sf-card p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <CheckCircle2 className="mr-1 inline size-3.5" />
        Completar mantenimiento
      </h3>

      <form action={action} className="space-y-4">
        <input type="hidden" name="maintenanceId" value={maintenanceId} />

        {state.ok === false && state.message && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="size-4" />
            {state.message}
          </div>
        )}
        {state.ok === true && state.message && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="size-4" />
            {state.message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Costo final (DOP)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="finalCost"
              defaultValue={state.values?.finalCost ?? defaultCost.toFixed(2)}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Próximo mantenimiento
            </label>
            <input
              type="date"
              name="nextMaintenanceDate"
              defaultValue={state.values?.nextMaintenanceDate}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Para recordatorio de mantenimiento preventivo recurrente.
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium">
            Notas / resultado del mantenimiento
          </label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={state.values?.notes}
            placeholder="Resumen del trabajo realizado, piezas cambiadas, etc."
            className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center justify-end pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-1 size-4 animate-spin" />
                Completando...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-1 size-4" />
                Marcar completado
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  )
}
