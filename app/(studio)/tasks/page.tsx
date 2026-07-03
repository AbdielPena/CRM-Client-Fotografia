import Link from "next/link"
import {
  CheckSquare,
  Plus,
  AlertCircle,
  Clock,
  CheckCircle2,
  Sun,
  CalendarDays,
  CalendarClock,
  ListChecks,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getTasks,
  getTodayTasks,
  type TaskRow,
  type TaskPriority,
} from "@/server/services/task.service"
import { cn } from "@/lib/utils/cn"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { TaskCard } from "@/components/tasks/task-card"

export const metadata: Metadata = { title: "Tareas" }

const TODAY = () => new Date().toISOString().slice(0, 10)

function isPinned(t: TaskRow, userId: string, today: string): boolean {
  return t.daily_pin_date === today && t.daily_pin_user_id === userId
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: {
    view?: string
    status?: string
    assignee?: string
    overdue?: string
    priority?: string
    type?: string
    personal?: string
    q?: string
  }
}) {
  const session = await requireStudioAuth()
  const view: "today" | "all" = searchParams?.view === "all" ? "all" : "today"
  const today = TODAY()

  const [todayData, allCount, unread] = await Promise.all([
    getTodayTasks(session.studioId, session.userId),
    getTasks(session.studioId, { pageSize: 1 }),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Productividad"
        title="Tareas"
        description="Tus tareas del día, personales y las vinculadas a clientes/proyectos. Recibe recordatorios."
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
        {/* Toggle Hoy | Todas */}
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <Link
            href="/tasks"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              view === "today"
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Sun className="h-3.5 w-3.5" /> Mis tareas de hoy
            <span
              className={cn(
                "rounded-full px-1.5 text-[10.5px] tabular-nums",
                view === "today" ? "bg-brand-foreground/20" : "bg-muted",
              )}
            >
              {todayData.total}
            </span>
          </Link>
          <Link
            href="/tasks?view=all"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              view === "all"
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ListChecks className="h-3.5 w-3.5" /> Todas
            <span
              className={cn(
                "rounded-full px-1.5 text-[10.5px] tabular-nums",
                view === "all" ? "bg-brand-foreground/20" : "bg-muted",
              )}
            >
              {allCount.total}
            </span>
          </Link>
        </div>

        {view === "today" ? (
          <TodayView data={todayData} userId={session.userId} today={today} />
        ) : (
          <AllView
            studioId={session.studioId}
            userId={session.userId}
            today={today}
            searchParams={searchParams}
          />
        )}
      </main>
    </>
  )
}

// ─── Vista "Mis tareas de hoy" ────────────────────────────────────────────────
function TodayView({
  data,
  userId,
  today,
}: {
  data: Awaited<ReturnType<typeof getTodayTasks>>
  userId: string
  today: string
}) {
  if (data.total === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="size-12 text-emerald-500/70" />}
        title="¡Nada pendiente para hoy!"
        description="No tienes tareas vencidas ni para hoy. Crea una tarea personal o añade una del CRM a tu día con la ⭐."
      >
        <Button asChild>
          <Link href="/tasks/new">
            <Plus className="mr-1 size-4" />
            Nueva tarea
          </Link>
        </Button>
      </EmptyState>
    )
  }
  return (
    <div className="space-y-6">
      <Bucket title="Vencidas" icon={<AlertCircle className="size-4 text-red-600" />} tone="danger" tasks={data.overdue} userId={userId} today={today} />
      <Bucket title="Hoy" icon={<Sun className="size-4 text-amber-500" />} tasks={data.today} userId={userId} today={today} />
      <Bucket title="Próximas" icon={<CalendarClock className="size-4 text-muted-foreground" />} tasks={data.upcoming} userId={userId} today={today} />
      <Bucket title="Personales" icon={<CalendarDays className="size-4 text-muted-foreground" />} tasks={data.personal} userId={userId} today={today} />
    </div>
  )
}

function Bucket({
  title,
  icon,
  tasks,
  tone,
  userId,
  today,
}: {
  title: string
  icon: React.ReactNode
  tasks: TaskRow[]
  tone?: "danger"
  userId: string
  today: string
}) {
  if (tasks.length === 0) return null
  return (
    <section>
      <h2
        className={cn(
          "mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider",
          tone === "danger" ? "text-red-600" : "text-muted-foreground",
        )}
      >
        {icon}
        {title}
        <span className="tabular-nums opacity-70">· {tasks.length}</span>
      </h2>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} pinnedToday={isPinned(t, userId, today)} />
        ))}
      </ul>
    </section>
  )
}

// ─── Vista "Todas" (KPIs + chips de filtro + lista) ──────────────────────────
async function AllView({
  studioId,
  userId,
  today,
  searchParams,
}: {
  studioId: string
  userId: string
  today: string
  searchParams?: {
    status?: string
    assignee?: string
    overdue?: string
    priority?: string
    type?: string
    personal?: string
    q?: string
  }
}) {
  const validStatus = ["pendiente", "en_progreso", "completada", "cancelada", "bloqueada"] as const
  const status = validStatus.includes(searchParams?.status as (typeof validStatus)[number])
    ? (searchParams!.status as (typeof validStatus)[number])
    : undefined
  const validPriority = ["low", "medium", "high", "urgent"] as const
  const priority = validPriority.includes(searchParams?.priority as TaskPriority)
    ? (searchParams!.priority as TaskPriority)
    : undefined
  const overdue = searchParams?.overdue === "1"
  const assignedToMe = searchParams?.assignee === "me"
  const type = searchParams?.type // client | project | ...
  const personal = searchParams?.personal === "1"

  const [tasks, allTasksRes, pendingRes, overdueRes, myTasksRes] = await Promise.all([
    getTasks(studioId, {
      status,
      assignedToUserId: assignedToMe ? userId : undefined,
      priority,
      entityType: type || undefined,
      noEntity: personal || undefined,
      overdue,
      search: searchParams?.q,
      pageSize: 100,
    }),
    getTasks(studioId, { pageSize: 1 }),
    getTasks(studioId, { status: "pendiente", pageSize: 1 }),
    getTasks(studioId, { overdue: true, pageSize: 1 }),
    getTasks(studioId, { assignedToUserId: userId, pageSize: 1 }),
  ])

  const DONE = new Set(["completada", "cancelada"])
  const sortedItems = [...tasks.items].sort(
    (a, b) => (DONE.has(a.status) ? 1 : 0) - (DONE.has(b.status) ? 1 : 0),
  )

  const base = (extra: Record<string, string>) =>
    "/tasks?" + new URLSearchParams({ view: "all", ...extra }).toString()

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Total" value={allTasksRes.total} icon={<CheckSquare className="size-4" />} tone="neutral" href="/tasks?view=all" active={!status && !overdue && !assignedToMe && !priority && !type && !personal} />
        <Kpi label="Pendientes" value={pendingRes.total} icon={<Clock className="size-4" />} tone="warning" href={base({ status: "pendiente" })} active={status === "pendiente"} />
        <Kpi label="Atrasadas" value={overdueRes.total} icon={<AlertCircle className="size-4" />} tone="danger" href={base({ overdue: "1" })} active={overdue} />
        <Kpi label="Asignadas a mí" value={myTasksRes.total} icon={<CheckSquare className="size-4" />} tone="neutral" href={base({ assignee: "me" })} active={assignedToMe} />
      </div>

      {/* Chips de filtro */}
      <div className="flex flex-wrap gap-1.5">
        <Chip label="En proceso" href={base({ status: "en_progreso" })} active={status === "en_progreso"} />
        <Chip label="Completadas" href={base({ status: "completada" })} active={status === "completada"} />
        <Chip label="Canceladas" href={base({ status: "cancelada" })} active={status === "cancelada"} />
        <span className="mx-1 self-center text-muted-foreground/40">|</span>
        <Chip label="🔴 Urgente" href={base({ priority: "urgent" })} active={priority === "urgent"} />
        <Chip label="🟠 Alta" href={base({ priority: "high" })} active={priority === "high"} />
        <span className="mx-1 self-center text-muted-foreground/40">|</span>
        <Chip label="Cliente" href={base({ type: "client" })} active={type === "client"} />
        <Chip label="Proyecto" href={base({ type: "project" })} active={type === "project"} />
        <Chip label="Personales" href={base({ personal: "1" })} active={personal} />
      </div>

      {tasks.total === 0 ? (
        <EmptyState
          icon={<CheckSquare className="size-12 text-muted-foreground/60" />}
          title="Sin tareas"
          description="No hay tareas con ese filtro. Crea una nueva o limpia los filtros."
        >
          <Button asChild variant="outline">
            <Link href="/tasks?view=all">Limpiar filtros</Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {sortedItems.map((t) => (
            <TaskCard key={t.id} task={t} pinnedToday={isPinned(t, userId, today)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Chip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={active ? "/tasks?view=all" : href}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors",
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
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
      className={"block rounded-xl border p-3 text-center transition-colors hover:shadow-sm " + cls}
    >
      <p className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </Link>
  )
}
