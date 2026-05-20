"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { XCircle, Loader2 } from "lucide-react"

import { cancelInvMaintenanceAction } from "@/server/actions/inv-maintenance.actions"
import { Button } from "@/components/ui/button"

export function MaintenanceActions({
  maintenanceId,
}: {
  maintenanceId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err"
    msg: string
  } | null>(null)

  async function handleCancel() {
    const reason =
      window.prompt(
        "Razón de cancelación (opcional). Si la unidad estaba en mantenimiento, queda con ese status. Resuelve manualmente con un nuevo movement.",
      ) ?? undefined
    if (reason === null) return
    startTransition(async () => {
      const res = await cancelInvMaintenanceAction(maintenanceId, reason)
      setFeedback({
        type: res.ok ? "ok" : "err",
        msg: res.message ?? "",
      })
      if (res.ok) router.refresh()
    })
  }

  return (
    <section className="sf-card p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Cancelar
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

      <Button
        onClick={handleCancel}
        disabled={isPending}
        size="sm"
        variant="outline"
        className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
      >
        {isPending ? (
          <Loader2 className="mr-1 size-3.5 animate-spin" />
        ) : (
          <XCircle className="mr-1 size-3.5" />
        )}
        Cancelar este mantenimiento
      </Button>
    </section>
  )
}
