import Link from "next/link"
import {
  CheckSquare,
  Plus,
  AlertCircle,
  Clock,
  CheckCircle2,
  PauseCircle,
  XCircle,
  User,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getTasks } from "@/server/services/task.service"
import { formatDate } from "@/lib/utils/currency"
import { STAGE_LABELS, type StageKey } from "@/lib/workflow/types"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"

export const metadata: Metadata = { title: "Tareas" }

const PRIORITY_CLS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
}

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  pendiente: Clock,
  en_progreso: PauseCircle,
  completada: CheckCircle2,
  cancelada: XCircle,
  bloqueada: AlertCircle,
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: {
    status?: string
    assignee?: string
    overdue?: string
    q?: string
  }
}) {
  const session = await requireStudioAuth()
  const validStatus = [
    "pendiente",
    "en_progreso",
    "completada",
    "cancelada",
    "bloqueada",
  ] as const
  const status = validStatus.includes(searchParams?.status as (typeof validStatus)[number])
    ? (searchParams!.status as (typeof validStatus)[number])
    : undefined

  const overdue = searchParams?.overdue === "1"
  const assignedToMe = searchParams?.assignee === "me"

  const [tasks, unread] = await Promise.all([
    getTasks(session.studioId, {
      status,
      assignedToUserId: assignedToMe ? session.userId : undefined,
      overdue,
      search: searchParams?.q,
      pageSize: 100,
    }),
    countUnreadNotifications(session.studioId),
  ])

  // KPIs
  const allTasksRes = await getTasks(session.studioId, { pageSize: 1 })
  // Para los conteos hacemos 3 queries chicas
  const [pendingRes, overdueRes, myTasksRes] = await Promise.all([
    getTasks(session.studioId, { status: "pendiente", pageSize: 1 }),
    getTasks(session.studioId, { overdue: true, pageSize: 1 }),
    getTasks(session.studioId, {
      assignedToUserId: session.userId,
      pageSize: 1,
    }),
  ])

  // El orden por fecha de entrega viene del servicio; aquí solo hundimos las
  // completadas/canceladas al fondo (sort estable: conserva la fecha dentro de
  // cada grupo). La página trae hasta 100 tareas = todas para este estudio.
  const DONE = new Set(["completada", "cancelada"])
  const sortedItems = [...tasks.items].sort(
    (a, b) => (DONE.has(a.status) ? 1 : 0) - (DONE.has(b.status) ? 1 : 0),
  )

  return (
    <>
      <AppTopbar
        eyebrow="Productividad"
        title="Tareas"
        description="Asigna tareas a tu equipo, vincúlalas a clientes/proyectos, recibe recordatorios."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/tasks/new">
              <Plus className="mr-1 size-4" />
              Nueva tarea
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label="Total"
            value={allTasksRes.total}
            icon={<CheckSquare className="size-4" />}
            tone="neutral"
            href="/tasks"
            active={!status && !overdue && !assignedToMe}
          />
          <Kpi
            label="Pendientes"
            value={pendingRes.total}
            icon={<Clock className="size-4" />}
            tone="warning"
            href="/tasks?status=pendiente"
            active={status === "pendiente"}
          />
          <Kpi
            label="Atrasadas"
            value={overdueRes.total}
            icon={<AlertCircle className="size-4" />}
            tone="danger"
            href="/tasks?overdue=1"
            active={overdue}
          />
          <Kpi
            label="Asignadas a mí"
            value={myTasksRes.total}
            icon={<CheckSquare className="size-4" />}
            tone="neutral"
            href="/tasks?assignee=me"
            active={assignedToMe}
          />
        </div>

        {/* Lista */}
        {tasks.total === 0 ? (
          <EmptyState
            icon={<CheckSquare className="size-12 text-muted-foreground/60" />}
            title="Sin tareas"
            description="Crea tu primera tarea y asígnala a alguien del equipo. Recibirá notificación in-app."
          >
            <Button asChild>
              <Link href="/tasks/new">
                <Plus className="mr-1 size-4" />
                Nueva tarea
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {sortedItems.map((t) => {
              const StatusIcon = STATUS_ICONS[t.status] ?? Clock
              const isOverdue =
                t.due_date &&
                ["pendiente", "en_progreso"].includes(t.status) &&
                new Date(`${t.due_date}T${t.due_time ?? "23:59"}`) < new Date()
              return (
                <li key={t.id}>
                  <Link
                    href={`/tasks/${t.id}`}
                    className="sf-card group block p-4 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={
                          "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full " +
                          (t.status === "completada"
                            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                            : isOverdue
                              ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                              : "bg-muted text-muted-foreground")
                        }
                      >
                        <StatusIcon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            className={
                              "text-sm font-semibold " +
                              (t.status === "completada"
                                ? "text-muted-foreground line-through"
                                : "")
                            }
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
                          {t.tags?.length > 0 && (
                            <>
                              {t.tags.slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </>
                          )}
                        </div>
                        {t.description && (
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            {t.description}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                          {t.due_date && (
                            <span
                              className={
                                isOverdue
                                  ? "font-semibold text-red-600"
                                  : ""
                              }
                            >
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
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </>
  )
}

function Kpi({
  label,
  value,
  icon,
  tone,
  href,
  active,
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone: "neutral" | "warning" | "danger"
  href: string
  active: boolean
}) {
  const cls = active
    ? "border-primary bg-primary text-primary-foreground"
    : tone === "warning" && value > 0
      ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
      : tone === "danger" && value > 0
        ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950"
        : "border-input bg-card"
  return (
    <Link
      href={href}
      className={
        "block rounded-xl border p-3 text-center transition-colors hover:shadow-sm " +
        cls
      }
    >
      <p className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </Link>
  )
}
