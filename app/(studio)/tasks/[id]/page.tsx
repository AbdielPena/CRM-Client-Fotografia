import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  CheckSquare,
  Calendar,
  User,
  Tag as TagIcon,
  Link2,
  Bell,
  Clock,
  Repeat,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getTaskById } from "@/server/services/task.service"
import { formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { TaskActions } from "./task-actions"

export const metadata: Metadata = { title: "Tarea" }

const PRIORITY_CLS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
}

const STATUS_CLS: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  en_progreso: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completada:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cancelada: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
  bloqueada: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}

export default async function TaskDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()

  const [task, unread] = await Promise.all([
    getTaskById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])

  if (!task) notFound()

  const today = new Date().toISOString().slice(0, 10)
  const isOverdue =
    task.due_date &&
    ["pendiente", "en_progreso"].includes(task.status) &&
    new Date(`${task.due_date}T${task.due_time ?? "23:59"}`) < new Date()

  return (
    <>
      <AppTopbar
        eyebrow="Tareas"
        title={task.title}
        description={task.description ?? undefined}
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/tasks">
              <ArrowLeft className="mr-1 size-3.5" />
              Tareas
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Status banner */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <span
            className={
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider " +
              (STATUS_CLS[task.status] ?? STATUS_CLS.pendiente)
            }
          >
            <CheckSquare className="size-3.5" />
            {task.status.replace("_", " ")}
          </span>
          <span
            className={
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " +
              (PRIORITY_CLS[task.priority] ?? PRIORITY_CLS.medium)
            }
          >
            {task.priority}
          </span>
          {task.is_recurring && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300">
              <Repeat className="size-2.5" />
              Recurrente · cada {task.recurring_interval_days}d
            </span>
          )}
          {isOverdue && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              ⚠ Atrasada
            </span>
          )}
          {task.completed_at && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              Completada{" "}
              {formatDate(new Date(task.completed_at))}
            </span>
          )}
        </div>

        {/* Detalles grid */}
        <section className="sf-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <KV
            label={
              <>
                <User className="mr-1 inline size-3" />
                Asignada a
              </>
            }
          >
            <span className="font-mono text-xs">
              {task.assigned_to_user_id?.slice(0, 8) ?? "—"}
            </span>
          </KV>
          <KV
            label={
              <>
                <Calendar className="mr-1 inline size-3" />
                Fecha límite
              </>
            }
          >
            <span className={isOverdue ? "font-semibold text-red-600" : ""}>
              {task.due_date
                ? `${formatDate(new Date(task.due_date))}${task.due_time ? ` ${task.due_time}` : ""}`
                : "—"}
            </span>
          </KV>
          <KV
            label={
              <>
                <Bell className="mr-1 inline size-3" />
                Recordatorio
              </>
            }
          >
            <span>
              {task.reminder_minutes_before
                ? `${task.reminder_minutes_before} min antes`
                : "—"}
            </span>
          </KV>
          {task.entity_type && (
            <KV
              label={
                <>
                  <Link2 className="mr-1 inline size-3" />
                  Vinculada a
                </>
              }
            >
              <span className="text-xs">
                {task.entity_type}:{" "}
                <span className="font-mono">
                  {task.entity_id?.slice(0, 8)}
                </span>
              </span>
            </KV>
          )}
          {task.tags?.length > 0 && (
            <KV
              label={
                <>
                  <TagIcon className="mr-1 inline size-3" />
                  Tags
                </>
              }
            >
              <div className="flex flex-wrap gap-1">
                {task.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </KV>
          )}
          {task.started_at && (
            <KV
              label={
                <>
                  <Clock className="mr-1 inline size-3" />
                  Iniciada
                </>
              }
            >
              <span>{formatDate(new Date(task.started_at))}</span>
            </KV>
          )}
        </section>

        {/* Descripción */}
        {task.description && (
          <section className="sf-card p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Descripción
            </h3>
            <p className="whitespace-pre-line text-sm">{task.description}</p>
          </section>
        )}

        {/* Notas */}
        {task.notes && (
          <section className="sf-card p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notas
            </h3>
            <p className="whitespace-pre-line text-sm">{task.notes}</p>
          </section>
        )}

        {/* Actions */}
        <TaskActions
          taskId={task.id}
          currentStatus={task.status}
          pinnedToday={
            task.daily_pin_date === today &&
            task.daily_pin_user_id === session.userId
          }
        />
      </main>
    </>
  )
}

function KV({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}
