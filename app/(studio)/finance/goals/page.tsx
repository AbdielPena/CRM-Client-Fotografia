import Link from "next/link"
import { Target, Plus, CheckCircle2, Calendar } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinGoals } from "@/server/services/fin-goal.service"
import { formatCurrency, formatDate } from "@/lib/utils/currency"
import { d } from "@/lib/decimal"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"

export const metadata: Metadata = { title: "Finanzas · Metas" }

export default async function FinanceGoalsPage() {
  const session = await requireStudioAuth()
  const [goals, unread] = await Promise.all([
    getFinGoals(session.studioId, { pageSize: 50 }),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Metas financieras"
        description="Ahorrar para algo específico — equipo nuevo, viajes, fondo de emergencia."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/finance/goals/new">
              <Plus className="mr-1 size-4" />
              Nueva meta
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {goals.total === 0 ? (
          <EmptyState
            icon={<Target className="size-12 text-muted-foreground/60" />}
            title="Sin metas creadas"
            description="Define metas para tener visibilidad de tu progreso de ahorros."
          >
            <Button asChild>
              <Link href="/finance/goals/new">
                <Plus className="mr-1 size-4" />
                Crear primera meta
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {goals.items.map((goal) => {
              const pct = Number(
                d(goal.monto_objetivo).gt(0)
                  ? d(goal.monto_actual).div(d(goal.monto_objetivo)).times(100).toFixed(0)
                  : 0,
              )
              const isCompleted = goal.estado === "completada"
              const remaining = Math.max(
                0,
                Number(d(goal.monto_objetivo).minus(d(goal.monto_actual)).toFixed(2)),
              )
              return (
                <Link
                  key={goal.id}
                  href={`/finance/goals/${goal.id}`}
                  className="sf-card p-5 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="line-clamp-1 font-display text-lg">
                      {goal.nombre}
                    </h3>
                    {isCompleted ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle2 className="size-3" />
                        Completada
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex items-baseline gap-2">
                    <p className="text-2xl font-bold tabular-nums">
                      {formatCurrency(Number(goal.monto_actual), goal.currency)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      de {formatCurrency(Number(goal.monto_objetivo), goal.currency)}
                    </p>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={
                        "h-full transition-all " +
                        (isCompleted
                          ? "bg-emerald-500"
                          : pct >= 75
                          ? "bg-emerald-500"
                          : pct >= 50
                          ? "bg-blue-500"
                          : pct >= 25
                          ? "bg-amber-500"
                          : "bg-zinc-300 dark:bg-zinc-700")
                      }
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="tabular-nums">{pct}% completado</span>
                    {!isCompleted && (
                      <span className="tabular-nums">
                        Faltan {formatCurrency(remaining, goal.currency)}
                      </span>
                    )}
                  </div>

                  {goal.fecha_objetivo && (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="size-3" />
                      Objetivo: {formatDate(new Date(goal.fecha_objetivo))}
                    </p>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
