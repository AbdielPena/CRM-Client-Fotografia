"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Loader2, Pencil, RotateCcw } from "lucide-react"

import { updateSessionProfitAction } from "@/server/actions/project.actions"
import { formatCurrency } from "@/lib/utils/currency"

/**
 * La ganancia de ESTA sesión, editable.
 *
 * Existe por los descuentos. La ganancia se copia del plan al asignarlo, pero
 * si a una clienta se le cobra menos, la ganancia real baja y el plan no tiene
 * cómo saberlo: a MAYCOL se le cobró 12,000 de una sesión de 24,000 y el
 * sistema seguía contando los 20,000 del plan.
 *
 * Se guarda en la sesión, así que subir el precio del plan mañana no reescribe
 * lo que se ganó ayer.
 */
export function SessionProfitEditor({
  projectId,
  amount,
  planAmount,
  currency,
  isOverride,
}: {
  projectId: string
  amount: number
  planAmount: number
  currency: string
  /** true = está ajustada a mano, distinta de la del plan. */
  isOverride: boolean
}) {
  const router = useRouter()
  const [editando, setEditando] = React.useState(false)
  const [valor, setValor] = React.useState(String(amount ?? ""))
  const [guardando, setGuardando] = React.useState(false)

  async function guardar(monto: string) {
    setGuardando(true)
    try {
      const fd = new FormData()
      fd.set("projectId", projectId)
      fd.set("amount", monto)
      const r = await updateSessionProfitAction(fd)
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success("Ganancia de la sesión actualizada")
      setEditando(false)
      router.refresh()
    } finally {
      setGuardando(false)
    }
  }

  if (!editando) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setValor(String(amount ?? ""))
            setEditando(true)
          }}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
          Ajustar por descuento
        </button>
        {isOverride ? (
          <span className="text-[11px] text-amber-700 dark:text-amber-400">
            Ajustada a mano · el plan dice {formatCurrency(planAmount, currency)}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="w-32 rounded-md border border-border bg-background px-2 py-1 text-[12.5px] tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <button
          type="button"
          onClick={() => guardar(valor)}
          disabled={guardando}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] font-medium hover:bg-muted disabled:opacity-50"
        >
          {guardando ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Guardar
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="text-[11.5px] text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
        {isOverride ? (
          <button
            type="button"
            onClick={() => guardar("")}
            disabled={guardando}
            className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            Volver a la del plan
          </button>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Lo que te queda limpio por ESTA sesión. Si le hiciste descuento, ponle lo
        que de verdad te quedó. El plan dice{" "}
        {formatCurrency(planAmount, currency)}.
      </p>
    </div>
  )
}
