import type { Metadata } from "next"
import { Workflow, CheckCircle2, AlertTriangle, CalendarClock, ListChecks } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getClientPipelines } from "@/server/services/workflow.service"
import { STAGE_LABELS, STAGE_ORDER, type ClientCard, type StageKey } from "@/lib/workflow/types"
import { AppTopbar } from "@/components/layout/app-topbar"
import { WorkflowClientCard } from "@/components/workflow/workflow-client-card"

export const metadata: Metadata = { title: "Pipeline de trabajo" }
export const dynamic = "force-dynamic"

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Etapa en la que está un cliente = la del proyecto MÁS URGENTE (el de entrega
 * más próxima). Casi siempre el cliente tiene una sola sesión; con varias,
 * mandamos la que hay que entregar primero. Si ninguna tiene etapa en curso
 * (todo hecho pero sin cerrar) cae en "finalized".
 */
function cardStageKey(card: ClientCard): StageKey {
  const withStage = card.projects
    .map((p) => ({
      due: p.estimatedDeliveryDate ?? "9999-12-31",
      key: p.stages.find((s) => s.state === "current" || s.state === "overdue")?.key,
    }))
    .filter((x): x is { due: string; key: StageKey } => !!x.key)
  if (withStage.length === 0) return "finalized"
  withStage.sort((a, b) => a.due.localeCompare(b.due))
  return withStage[0]!.key
}

export default async function DeliveriesPage() {
  const session = await requireStudioAuth()
  const [cards, unread] = await Promise.all([
    getClientPipelines(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  const active = cards.filter((c) => !c.finalized)
  const finalized = cards.filter((c) => c.finalized)

  // Los activos van agrupados POR ETAPA del flujo. `cards` ya viene ordenado por
  // entrega más próxima, así que al agrupar cada sección conserva ese orden:
  // dentro de cada etapa, lo que hay que entregar primero queda arriba.
  const activeByStage = new Map<StageKey, ClientCard[]>()
  for (const c of active) {
    const k = cardStageKey(c)
    const list = activeByStage.get(k)
    if (list) list.push(c)
    else activeByStage.set(k, [c])
  }
  // Solo las etapas EN CURSO (finalized tiene su propia sección abajo).
  const activeStages = STAGE_ORDER.filter(
    (k) => k !== "finalized" && (activeByStage.get(k)?.length ?? 0) > 0,
  )

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
            {/* Activos — una sección por ETAPA del flujo; dentro de cada una, la
                entrega más próxima primero. */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  En curso ({active.length})
                </h2>
              </div>
              {active.length === 0 ? (
                <div className="sf-card py-8 text-center text-sm text-muted-foreground">
                  No hay trabajos en curso. ¡Todo al día!
                </div>
              ) : (
                <div className="space-y-7">
                  {activeStages.map((stageKey) => {
                    const group = activeByStage.get(stageKey) ?? []
                    const overdue = group.reduce((a, c) => a + c.totalOverdue, 0)
                    return (
                      <div key={stageKey} className="space-y-3">
                        <div className="flex items-center gap-2.5 border-b border-border/60 pb-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {STAGE_LABELS[stageKey]}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-muted-foreground">
                            {group.length}
                          </span>
                          {overdue > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-400">
                              <AlertTriangle className="h-3 w-3" />
                              {overdue} atrasada{overdue === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                          {group.map((card, i) => (
                            <WorkflowClientCard key={card.clientId} card={card} index={i} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

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
          El pipeline se ordena por fecha de entrega final más próxima; los
          clientes finalizados van al final. Una etapa se marca <strong>atrasada</strong>{" "}
          cuando su fecha límite vence. El cliente se marca finalizado al confirmar
          el envío de impresiones de todos sus proyectos.
        </p>
      </div>
    </>
  )
}
