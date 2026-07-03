"use client"

import Link from "next/link"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Clock, User, Check, Star, Loader2 } from "lucide-react"

import {
  changeTaskStatusAction,
  pinTaskToDailyAction,
} from "@/server/actions/task.actions"
import type { TaskRow } from "@/server/services/task.service"
import { formatDate } from "@/lib/utils/currency"
import { STAGE_LABELS, type StageKey } from "@/lib/workflow/types"
import { cn } from "@/lib/utils/cn"

const PRIORITY_CLS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
}

export function TaskCard({
  task: t,
  pinnedToday,
}: {
  task: TaskRow
  pinnedToday: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const done = t.status === "completada"
  const isOverdue =
    !!t.due_date &&
    ["pendiente", "en_progreso"].includes(t.status) &&
    new Date(`${t.due_date}T${t.due_time ?? "23:59"}`) < new Date()

  const toggleComplete = () =>
    start(async () => {
      const res = await changeTaskStatusAction(t.id, done ? "pendiente" : "completada")
      if (res.ok) {
        toast.success(done ? "Tarea reabierta" : "¡Completada!")
        router.refresh()
      } else toast.error(res.message ?? "Error")
    })

  const togglePin = () =>
    start(async () => {
      const res = await pinTaskToDailyAction(t.id, !pinnedToday)
      if (res.ok) {
        toast.success(res.message ?? "")
        router.refresh()
      } else toast.error(res.message ?? "Error")
    })

  return (
    <li className="sf-card flex items-start gap-3 p-4">
      {/* Checkbox: completar / reabrir */}
      <button
        type="button"
        onClick={toggleComplete}
        disabled={pending}
        title={done ? "Reabrir tarea" : "Marcar como completada"}
        className={cn(
          "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : isOverdue
              ? "border-red-300 text-transparent hover:border-red-500 hover:text-red-400"
              : "border-input text-transparent hover:border-emerald-500 hover:text-emerald-500",
        )}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          <Check className="size-3.5" />
        )}
      </button>

      {/* Contenido (abre el detalle) */}
      <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className={cn(
              "text-sm font-semibold",
              done && "text-muted-foreground line-through",
            )}
          >
            {t.title}
          </h3>
          <span
            className={
              "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium " +
              (PRIORITY_CLS[t.priority] ?? PRIORITY_CLS.medium)
            }
          >
            {t.priority}
          </span>
          {t.workflow_stage && STAGE_LABELS[t.workflow_stage as StageKey] && (
            <span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-[9px] font-medium text-brand">
              Pipeline · {STAGE_LABELS[t.workflow_stage as StageKey]}
            </span>
          )}
          {t.tags?.length > 0 &&
            t.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
        </div>
        {t.description && (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {t.description}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          {t.due_date && (
            <span className={isOverdue ? "font-semibold text-red-600" : ""}>
              <Clock className="mr-0.5 inline size-2.5" />
              {formatDate(new Date(t.due_date))}
              {t.due_time && ` ${t.due_time}`}
              {isOverdue && " (atrasada)"}
            </span>
          )}
          {t.client_name ? (
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              · <User className="inline size-2.5" /> {t.client_name}
            </span>
          ) : t.entity_type ? (
            <span>· Vinculada a {t.entity_type}</span>
          ) : null}
          {t.is_recurring && <span>· 🔁 Recurrente</span>}
        </div>
      </Link>

      {/* Fijar a "Mis tareas de hoy" */}
      <button
        type="button"
        onClick={togglePin}
        disabled={pending}
        title={pinnedToday ? "Quitar de hoy" : "Añadir a mis tareas de hoy"}
        className={cn(
          "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
          pinnedToday
            ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950"
            : "text-muted-foreground/40 hover:bg-accent hover:text-amber-500",
        )}
      >
        <Star className={cn("size-4", pinnedToday && "fill-amber-500")} />
      </button>
    </li>
  )
}
