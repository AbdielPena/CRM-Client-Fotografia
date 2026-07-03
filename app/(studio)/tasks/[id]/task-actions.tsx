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
  RotateCcw,
  Star,
  Copy,
  CalendarClock,
} from "lucide-react"

import {
  changeTaskStatusAction,
  deleteTaskAction,
  duplicateTaskAction,
  pinTaskToDailyAction,
  postponeTaskAction,
} from "@/server/actions/task.actions"
import type { TaskStatus } from "@/server/services/task.service"
import { Button } from "@/components/ui/button"

export function TaskActions({
  taskId,
  currentStatus,
  pinnedToday,
}: {
  taskId: string
  currentStatus: TaskStatus
  pinnedToday: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null)

  const done = currentStatus === "completada" || currentStatus === "cancelada"

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    startTransition(async () => {
      const res = await fn()
      setFeedback({ type: res.ok ? "ok" : "err", msg: res.message ?? "" })
      if (res.ok) {
        if (after) after()
        else router.refresh()
      }
    })
  }

  function handleDelete() {
    if (!window.confirm("¿Eliminar esta tarea?")) return
    run(
      () => deleteTaskAction(taskId),
      () => setTimeout(() => router.push("/tasks"), 400),
    )
  }

  function handleDuplicate() {
    startTransition(async () => {
      const res = await duplicateTaskAction(taskId)
      setFeedback({ type: res.ok ? "ok" : "err", msg: res.message ?? "" })
      if (res.ok && res.taskId) router.push(`/tasks/${res.taskId}`)
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
          <Button onClick={() => run(() => changeTaskStatusAction(taskId, "en_progreso"))} disabled={isPending} size="sm" variant="outline">
            <PlayCircle className="mr-1 size-3.5" /> Iniciar
          </Button>
        )}
        {currentStatus === "en_progreso" && (
          <Button onClick={() => run(() => changeTaskStatusAction(taskId, "pendiente"))} disabled={isPending} size="sm" variant="outline">
            <PauseCircle className="mr-1 size-3.5" /> Pausar
          </Button>
        )}
        {(currentStatus === "pendiente" || currentStatus === "en_progreso") && (
          <Button onClick={() => run(() => changeTaskStatusAction(taskId, "completada"))} disabled={isPending} size="sm">
            {isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 size-3.5" />}
            Completar
          </Button>
        )}
        {done && (
          <Button onClick={() => run(() => changeTaskStatusAction(taskId, "pendiente"))} disabled={isPending} size="sm" variant="outline">
            <RotateCcw className="mr-1 size-3.5" /> Reabrir
          </Button>
        )}

        {/* Fijar a mis tareas de hoy */}
        <Button
          onClick={() => run(() => pinTaskToDailyAction(taskId, !pinnedToday))}
          disabled={isPending}
          size="sm"
          variant="outline"
          className={pinnedToday ? "border-amber-300 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950" : ""}
        >
          <Star className={"mr-1 size-3.5 " + (pinnedToday ? "fill-amber-500 text-amber-500" : "")} />
          {pinnedToday ? "Quitar de hoy" : "Añadir a hoy"}
        </Button>

        {/* Posponer */}
        {!done && (
          <>
            <Button onClick={() => run(() => postponeTaskAction(taskId, 1))} disabled={isPending} size="sm" variant="outline">
              <CalendarClock className="mr-1 size-3.5" /> Mañana
            </Button>
            <Button onClick={() => run(() => postponeTaskAction(taskId, 7))} disabled={isPending} size="sm" variant="outline">
              +1 semana
            </Button>
          </>
        )}

        <Button onClick={handleDuplicate} disabled={isPending} size="sm" variant="outline">
          <Copy className="mr-1 size-3.5" /> Duplicar
        </Button>

        {currentStatus !== "cancelada" && currentStatus !== "completada" && (
          <Button onClick={() => run(() => changeTaskStatusAction(taskId, "cancelada"))} disabled={isPending} size="sm" variant="outline" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
            <XCircle className="mr-1 size-3.5" /> Cancelar
          </Button>
        )}
        <Button onClick={handleDelete} disabled={isPending} size="sm" variant="outline" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
          <Trash2 className="mr-1 size-3.5" /> Eliminar
        </Button>
      </div>
    </section>
  )
}
