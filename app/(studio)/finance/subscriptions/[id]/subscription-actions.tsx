"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PauseCircle, PlayCircle, Loader2 } from "lucide-react"

import {
  pauseFinSubscriptionAction,
  resumeFinSubscriptionAction,
} from "@/server/actions/fin-subscription.actions"
import { Button } from "@/components/ui/button"

export function SubscriptionActions({
  subscriptionId,
  isActive,
  proximaFecha,
}: {
  subscriptionId: string
  isActive: boolean
  proximaFecha: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err"
    msg: string
  } | null>(null)
  const [resumeDate, setResumeDate] = useState(
    proximaFecha ?? new Date().toISOString().slice(0, 10),
  )

  async function handlePause() {
    if (
      !window.confirm(
        "¿Pausar esta suscripción? No se generarán cargos hasta que la reanudes.",
      )
    )
      return
    startTransition(async () => {
      const res = await pauseFinSubscriptionAction(subscriptionId)
      setFeedback({
        type: res.ok ? "ok" : "err",
        msg: res.message ?? "",
      })
      if (res.ok) router.refresh()
    })
  }

  async function handleResume() {
    startTransition(async () => {
      const res = await resumeFinSubscriptionAction(subscriptionId, resumeDate)
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
        Acciones
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

      {isActive ? (
        <Button
          onClick={handlePause}
          disabled={isPending}
          size="sm"
          variant="outline"
        >
          {isPending ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <PauseCircle className="mr-1 size-3.5" />
          )}
          Pausar suscripción
        </Button>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">
              Próximo cobro al reanudar
            </label>
            <input
              type="date"
              value={resumeDate}
              onChange={(e) => setResumeDate(e.target.value)}
              className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <Button onClick={handleResume} disabled={isPending} size="sm">
            {isPending ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <PlayCircle className="mr-1 size-3.5" />
            )}
            Reanudar
          </Button>
        </div>
      )}
    </section>
  )
}
