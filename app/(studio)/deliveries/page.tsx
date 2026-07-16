import type { Metadata } from "next"
import { Workflow, CheckCircle2, AlertTriangle, CalendarClock, ListChecks } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getClientPipelines } from "@/server/services/workflow.service"
import { getProjectStatuses } from "@/server/services/project-status.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { WorkflowClientCard } from "@/components/workflow/workflow-client-card"
import { PipelineList } from "@/components/workflow/pipeline-list"

export const metadata: Metadata = { title: "Pipeline de trabajo" }
export const dynamic = "force-dynamic"

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export default async function DeliveriesPage() {
  const session = await requireStudioAuth()
  const [cards, unread, statuses] = await Promise.all([
    getClientPipelines(session.studioId),
    countUnreadNotifications(session.studioId),
    getProjectStatuses(session.studioId),
  ])

  const active = cards.filter((c) => !c.finalized)
  const finalized = cards.filter((c) => c.finalized)

  // Las opciones del desplegable salen de los estados configurados por el
  // estudio (no de una lista fija): así siguen cualquier renombrado.
  const statusOptions = statuses.map((s) => ({ label: s.label, color: s.color ?? null }))

  const today = todayStr()
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  const totalOverdue = cards.reduce((acc, c) => acc + c.totalOverdue, 0)
  const dueThisWeek = active.reduce(
    (acc, c) =>
      acc +
      c.projects.filter(
        (p) =>
          p.estimatedDeliveryDate &&
          p.estimatedDeliveryDate >= today &&
          p.estimatedDeliveryDate <= weekAhead,
      ).length,
    0,
  )

  const statCards = [
    { label: "Clientes activos", value: active.length, icon: ListChecks, cls: "text-foreground" },
    { label: "Etapas atrasadas", value: totalOverdue, icon: AlertTriangle, cls: "text-red-600" },
    { label: "Entregas esta semana", value: dueThisWeek, icon: CalendarClock, cls: "text-amber-600" },
    { label: "Finalizados", value: finalized.length, icon: CheckCircle2, cls: "text-emerald-600" },
  ]

  return (
    <>
      <AppTopbar
        eyebrow="Estudio"
        title="Pipeline de trabajo"
        description="El flujo de cada cliente en un solo lugar: sesión → selección → edición → galería final → impresiones → finalizado"
        unreadNotifications={unread}
      />

      <div className="space-y-6 px-6 py-6 lg:px-8 lg:py-8">
        {/* Widgets resumen */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statCards.map((c) => {
            const Icon = c.icon
            return (
              <div key={c.label} className="sf-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  <span className="text-[11px] uppercase tracking-wide">{c.label}</span>
                </div>
                <p className={`mt-1 text-2xl font-bold ${c.cls}`}>{c.value}</p>
              </div>
            )
          })}
        </div>

        {cards.length === 0 ? (
          <div className="sf-card py-16 text-center">
            <Workflow className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Aún no hay trabajos en curso</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Cuando confirmes una reserva con cliente y fecha de sesión, aparecerá
              aquí su pipeline. Las tareas de cada etapa (enviar selección, enviar
              impresiones) se generan automáticamente.
            </p>
          </div>
        ) : (
          <>
            {/* Activos — lista plana ordenada por avance; el estudio elige qué
                ver con el desplegable de estado. */}
            <PipelineList cards={active} statuses={statusOptions} />

            {/* Finalizados */}
            {finalized.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <h2 className="text-sm font-semibold text-foreground">
                    Finalizados ({finalized.length})
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {finalized.map((card, i) => (
                    <WorkflowClientCard key={card.clientId} card={card} index={i} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <p className="text-[11px] text-muted-foreground">
          El pipeline se ordena por <strong>avance</strong>: lo más cerca de terminar
          va primero y, a igual avance, la entrega más próxima; los clientes
          finalizados van al final. Una etapa se marca <strong>atrasada</strong>{" "}
          cuando su fecha límite vence. El cliente se marca finalizado al confirmar
          el envío de impresiones de todos sus proyectos.
        </p>
      </div>
    </>
  )
}
