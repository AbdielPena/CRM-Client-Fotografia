"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  PauseCircle,
  PlayCircle,
  Trash2,
  Loader2,
} from "lucide-react"

import {
  deleteAutomationAction,
  toggleAutomationAction,
} from "@/server/actions/automation.actions"
import { Button } from "@/components/ui/button"

export function AutomationActions({
  ruleId,
  isActive,
}: {
  ruleId: string
  isActive: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err"
    msg: string
  } | null>(null)

  async function handleToggle() {
    startTransition(async () => {
      const res = await toggleAutomationAction(ruleId, !isActive)
      setFeedback({ type: res.ok ? "ok" : "err", msg: res.message ?? "" })
      if (res.ok) router.refresh()
    })
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "¿Eliminar esta regla? Su historial de runs se conserva pero la regla deja de existir.",
      )
    )
      return
    startTransition(async () => {
      const res = await deleteAutomationAction(ruleId)
      setFeedback({ type: res.ok ? "ok" : "err", msg: res.message ?? "" })
      if (res.ok) {
        // pequeño delay para mostrar feedback antes de salir
        setTimeout(() => router.push("/automations"), 400)
      }
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={handleToggle}
          disabled={isPending}
          size="sm"
          variant="outline"
        >
          {isPending ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : isActive ? (
            <PauseCircle className="mr-1 size-3.5" />
          ) : (
            <PlayCircle className="mr-1 size-3.5" />
          )}
          {isActive ? "Pausar regla" : "Activar regla"}
        </Button>
        <Button
          onClick={handleDelete}
          disabled={isPending}
          size="sm"
          variant="outline"
          className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
        >
          {isPending ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <Trash2 className="mr-1 size-3.5" />
          )}
          Eliminar
        </Button>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Pausar mantiene la configuración pero deja de ejecutar. Eliminar borra
        la regla (los runs históricos no se borran).
      </p>
    </section>
  )
}
