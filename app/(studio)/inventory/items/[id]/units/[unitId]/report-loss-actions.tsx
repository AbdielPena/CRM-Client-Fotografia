"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Loader2 } from "lucide-react"

import { reportInvUnitLossAction } from "@/server/actions/inv-item-unit.actions"
import { Button } from "@/components/ui/button"

export function ReportLossActions({
  unitId,
  currentStatus,
}: {
  unitId: string
  currentStatus: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err"
    msg: string
  } | null>(null)

  async function handleReport(kind: "perdida" | "dano") {
    const label = kind === "perdida" ? "perdida" : "dañada"
    const reason = window.prompt(
      `¿Por qué está ${label}? (mínimo 5 caracteres)`,
    )
    if (!reason) return
    if (reason.length < 5) {
      setFeedback({
        type: "err",
        msg: "Debes dar al menos 5 caracteres de razón.",
      })
      return
    }

    const formData = new FormData()
    formData.append("unitId", unitId)
    formData.append("kind", kind)
    formData.append("reason", reason)

    startTransition(async () => {
      const res = await reportInvUnitLossAction(formData)
      setFeedback({
        type: res.ok ? "ok" : "err",
        msg: res.message ?? "",
      })
      if (res.ok) router.refresh()
    })
  }

  return (
    <section className="sf-card border-red-200 p-5 dark:border-red-900">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
        <AlertTriangle className="mr-1 inline size-3.5" />
        Reportar incidente
      </h3>

      {feedback && (
        <div
          className={
            "mb-3 rounded-lg px-3 py-2 text-xs " +
            (feedback.type === "ok"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300")
          }
        >
          {feedback.msg}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {currentStatus === "disponible" && (
          <Button
            onClick={() => handleReport("dano")}
            disabled={isPending}
            size="sm"
            variant="outline"
            className="text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950"
          >
            {isPending ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <AlertTriangle className="mr-1 size-3.5" />
            )}
            Marcar como dañada
          </Button>
        )}
        <Button
          onClick={() => handleReport("perdida")}
          disabled={isPending}
          size="sm"
          variant="outline"
          className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
        >
          {isPending ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <AlertTriangle className="mr-1 size-3.5" />
          )}
          Marcar como perdida
        </Button>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Esto emite un movement en el ledger y cambia el status. La acción es
        recuperable solo con un movement manual de SQL.
      </p>
    </section>
  )
}
