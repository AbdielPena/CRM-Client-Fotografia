"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  XCircle,
  Trash2,
  Loader2,
} from "lucide-react"

import {
  changeTaskStatusAction,
  deleteTaskAction,
} from "@/server/actions/task.actions"
import type { TaskStatus } from "@/server/services/task.service"
import { Button } from "@/components/ui/button"

export function TaskActions({
  taskId,
  currentStatus,
}: {
  taskId: string
  currentStatus: TaskStatus
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err"
    msg: string
  } | null>(null)

  async function handleStatusChange(status: TaskStatus) {
    startTransition(async () => {
      const res = await changeTaskStatusAction(taskId, status)
      setFeedback({ type: res.ok ? "ok" : "err", msg: res.message ?? "" })
      if (res.ok) router.refresh()
    })
  }

  async function handleDelete() {
    if (!window.confirm("¿Eliminar esta tarea?")) return
    startTransition(async () => {
      const res = await deleteTaskAction(taskId)
      setFeedback({ type: res.ok ? "ok" : "err", msg: res.message ?? "" })
      if (res.ok) setTimeout(() => router.push("/tasks"), 400)
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
        {currentStatus === "pendiente" && (
          <Button
            onClick={() => handleStatusChange("en_progreso")}
            disabled={isPending}
            size="sm"
            variant="outline"
          >
            {isPending ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <PlayCircle className="mr-1 size-3.5" />
            )}
            Iniciar
          </Button>
        )}
        {currentStatus === "en_progreso" && (
          <Button
            onClick={() => handleStatusChange("pendiente")}
            disabled={isPending}
            size="sm"
            variant="outline"
          >
            <PauseCircle className="mr-1 size-3.5" />
            Pausar
          </Button>
        )}
        {(currentStatus === "pendiente" || currentStatus === "en_progreso") && (
          <Button
            onClick={() => handleStatusChange("completada")}
            disabled={isPending}
            size="sm"
          >
            {isPending ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1 size-3.5" />
            )}
            Completar
          </Button>
        )}
        {currentStatus !== "cancelada" && currentStatus !== "completada" && (
          <Button
            onClick={() => handleStatusChange("cancelada")}
            disabled={isPending}
            size="sm"
            variant="outline"
            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
          >
            <XCircle className="mr-1 size-3.5" />
            Cancelar
          </Button>
        )}
        <Button
          onClick={handleDelete}
          disabled={isPending}
          size="sm"
          variant="outline"
          className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
        >
          <Trash2 className="mr-1 size-3.5" />
          Eliminar
        </Button>
      </div>
    </section>
  )
}
