import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Target, Calendar, PlusCircle } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { untypedServer } from "@/server/supabase/untyped"
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils/currency"
import { d } from "@/lib/decimal"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { GoalContributionForm } from "./contribution-form"

export const metadata: Metadata = { title: "Detalle Meta · Finanzas" }

export default async function GoalDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const sb = untypedServer()

  const [goalRes, contribsRes, unread] = await Promise.all([
    sb
      .from("fin_goals")
      .select("*")
      .eq("id", params.id)
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .maybeSingle(),
    sb
      .from("fin_goal_contributions")
      .select("*")
      .eq("goal_id", params.id)
      .eq("studio_id", session.studioId)
      .order("fecha", { ascending: false }),
    countUnreadNotifications(session.studioId),
  ])

  if (!goalRes.data) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const goal = goalRes.data as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contribs = (contribsRes.data ?? []) as any[]

  const objetivo = Number(goal.monto_objetivo)
  const actual = Number(goal.monto_actual)
  const restante = Math.max(0, objetivo - actual)
  const pct = objetivo > 0 ? Math.min(100, Math.round((actual / objetivo) * 100)) : 0
  const reached = goal.estado === "completada" || actual >= objetivo

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas / Metas"
        title={goal.nombre}
        description={`${formatCurrency(actual, goal.currency)} de ${formatCurrency(objetivo, goal.currency)} · ${goal.estado}`}
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/finance/goals">
              <ArrowLeft className="mr-1 size-3.5" />
              Volver
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Resumen visual */}
        <section className="sf-card p-6">
          <div className="flex items-baseline gap-2">
            <Target className={reached ? "size-8 text-emerald-500" : "size-8 text-primary"} />
            <div>
              <p className="text-3xl font-bold tabular-nums">
                {formatCurrency(actual, goal.currency)}
              </p>
              <p className="text-sm text-muted-foreground">
                de {formatCurrency(objetivo, goal.currency)} objetivo
              </p>
            </div>
          </div>

          <div className="mt-4">
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div
                className={
                  "h-full transition-all " +
                  (reached
                    ? "bg-emerald-500"
                    : pct >= 75
                    ? "bg-emerald-500"
                    : pct >= 50
                    ? "bg-blue-500"
                    : pct >= 25
                    ? "bg-amber-500"
                    : "bg-zinc-300 dark:bg-zinc-700")
                }
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="tabular-nums">{pct}% completado</span>
              {!reached && (
                <span className="tabular-nums">
                  Faltan {formatCurrency(restante, goal.currency)}
                </span>
              )}
              {reached && (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  ¡Meta alcanzada!
                </span>
              )}
            </div>
          </div>

          {goal.fecha_objetivo && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="size-3" />
              Fecha objetivo: {formatDate(new Date(goal.fecha_objetivo))}
            </p>
          )}
        </section>

        {/* Form contribución */}
        {!reached && goal.estado !== "cancelada" && (
          <section className="sf-card p-6">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <PlusCircle className="size-5 text-primary" />
              Agregar aporte
            </h3>
            <GoalContributionForm
              goalId={goal.id}
              remaining={restante}
              currency={goal.currency}
            />
          </section>
        )}

        {/* Historial */}
        {contribs.length > 0 && (
          <section className="sf-card overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="text-base font-semibold">Historial de aportes</h3>
              <p className="text-[11px] text-muted-foreground">
                {contribs.length} aporte(s)
              </p>
            </div>
            <ul className="divide-y divide-border">
              {contribs.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums text-primary">
                      + {formatCurrency(Number(c.monto), goal.currency)}
                    </p>
                    {c.notas && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {c.notas}
                      </p>
                    )}
                  </div>
                  <time className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDateShort(new Date(c.fecha))}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  )
}
