"use client"

import { useActionState } from "react"
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react"

import {
  markTithePaidAction,
  type FinTitheActionState,
} from "@/server/actions/fin-tithe.actions"
import { formatCurrency } from "@/lib/utils/currency"
import { Button } from "@/components/ui/button"

const initialState: FinTitheActionState = {}

export function MarkPaidForm({
  titheId,
  montoDiezmo,
  accounts,
  categories,
}: {
  titheId: string
  montoDiezmo: number
  accounts: Array<{ id: string; nombre: string; currency: string }>
  categories: Array<{ id: string; nombre: string; tipo: string }>
}) {
  const [state, action, pending] = useActionState(
    markTithePaidAction,
    initialState,
  )

  return (
    <section className="sf-card p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <CheckCircle2 className="mr-1 inline size-3.5" />
        Registrar pago
      </h3>

      <form action={action} className="space-y-4">
        <input type="hidden" name="titheId" value={titheId} />

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

        <div className="rounded-xl bg-muted px-3 py-2">
          <p className="text-[10px] uppercase text-muted-foreground">
            Monto a pagar
          </p>
          <p className="text-lg font-bold tabular-nums">
            {formatCurrency(montoDiezmo)}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Fecha de pago <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="fechaPago"
              required
              defaultValue={
                state.values?.fechaPago ?? new Date().toISOString().slice(0, 10)
              }
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          {accounts.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Cuenta de origen
              </label>
              <select
                name="cuentaId"
                defaultValue={state.values?.cuentaId ?? ""}
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Sin cuenta —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre} ({a.currency})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {categories.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Categoría (opcional)
            </label>
            <select
              name="categoriaId"
              defaultValue={state.values?.categoriaId ?? ""}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— Sin categoría —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium">Notas</label>
          <textarea
            name="notas"
            rows={2}
            defaultValue={state.values?.notas}
            placeholder="Iglesia, ministerio, etc."
            className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-input bg-background p-3">
          <input
            type="checkbox"
            name="createTransaction"
            defaultChecked
            className="mt-0.5 rounded border-input"
          />
          <div>
            <p className="text-sm font-medium">
              Crear transacción de gasto vinculada
            </p>
            <p className="text-xs text-muted-foreground">
              Crea una fin_transactions.gasto con is_business=false (no
              afecta utilidad operacional). Recomendado para tracking en
              reportes.
            </p>
          </div>
        </label>

        <div className="flex items-center justify-end pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-1 size-4 animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-1 size-4" />
                Marcar como pagado
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  )
}
