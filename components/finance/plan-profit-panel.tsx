"use client"

import * as React from "react"
import { CalendarClock, ChevronDown, CircleHelp } from "lucide-react"

import type { PlanProfitSummary } from "@/server/services/plan-profit.service"
import { formatCurrency } from "@/lib/utils/currency"
import { cn } from "@/lib/utils/cn"

/**
 * Ganancia por mes: lo confirmado y lo previsto.
 *
 * Manda el MES. A la izquierda están todos —los que pasaron y los que vienen—;
 * a la derecha el detalle del que elijas.
 *
 * Los dos números viven separados a propósito y nunca se mezclan en uno solo:
 *
 *   · CONFIRMADO — sesiones ya cobradas completas. Es plata en mano.
 *   · PREVISTO   — sesiones registradas que aún deben. Es una expectativa, y
 *                  se cae si la clienta no paga.
 *
 * Sumarlos en una sola cifra haría creer que ya se ganó algo que todavía no
 * entró. Por eso el total esperado va aparte y en menor jerarquía.
 */

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

function nombreMes(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number)
  if (!y || !m) return periodo
  return `${MESES[m - 1]} ${y}`
}

/** '2026-08-17' -> '17 ago'. Mediodia: en UTC la fecha retrocede un dia en RD. */
function fechaCorta(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso)
  return new Intl.DateTimeFormat("es-DO", {
    day: "numeric",
    month: "short",
    timeZone: "America/Santo_Domingo",
  }).format(d)
}

export function PlanProfitPanel({ data }: { data: PlanProfitSummary }) {
  const { plans, months, byMonth, byMonthClients, unscheduled } = data
  // Arranca en el mes en curso: es el que se mira todos los días.
  const actual = React.useMemo(
    () => new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santo_Domingo",
      year: "numeric",
      month: "2-digit",
    })
      .format(new Date())
      .slice(0, 7),
    [],
  )
  const [periodo, setPeriodo] = React.useState(
    () => (months.some((m) => m.period === actual) ? actual : months[0]?.period) ?? "",
  )
  const [verPlanes, setVerPlanes] = React.useState(false)

  const mes = months.find((m) => m.period === periodo) ?? months[0]
  const planPorId = React.useMemo(
    () => new Map(plans.map((p) => [p.packageId, p])),
    [plans],
  )
  const detalle = byMonth[periodo] ?? []
  const sesiones = byMonthClients[periodo] ?? []
  // La barra compara meses entre sí: un monto suelto no dice si fue buen mes.
  const tope = Math.max(...months.map((m) => m.profit + m.projectedProfit), 1)

  if (!mes) return null

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Ganancia por mes
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          <strong>Confirmado</strong> es lo ya cobrado completo.{" "}
          <strong>Previsto</strong> son sesiones registradas que aún deben: caen
          en el mes de su sesión, porque el saldo se paga ese día. Se actualiza
          solo según vas registrando sesiones y pagos.
        </p>
      </div>

      <div className="sf-card overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,232px)_1fr]">
          {/* ── Los meses ─────────────────────────────────────────────── */}
          <ul className="border-b border-border/70 md:border-b-0 md:border-r">
            {months.map((m) => {
              const activo = m.period === periodo
              const futuro = m.period > actual
              return (
                <li key={m.period}>
                  <button
                    type="button"
                    onClick={() => setPeriodo(m.period)}
                    className={cn(
                      "w-full px-4 py-2.5 text-left transition-colors",
                      activo ? "bg-accent/50" : "hover:bg-accent/25",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "text-[12.5px] capitalize",
                          activo
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {nombreMes(m.period)}
                        {futuro ? (
                          <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                            por venir
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[12.5px] tabular-nums",
                          activo
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {m.profit > 0 ? formatCurrency(m.profit, "DOP") : "—"}
                      </span>
                    </div>

                    {/* Barra en dos tramos: sólido lo cobrado, tenue lo previsto. */}
                    <div className="mt-1 flex h-1 w-full overflow-hidden rounded-full bg-border/60">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${(m.profit / tope) * 100}%` }}
                      />
                      <div
                        className="h-full bg-emerald-500/30"
                        style={{ width: `${(m.projectedProfit / tope) * 100}%` }}
                      />
                    </div>

                    {m.projectedProfit > 0 ? (
                      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                        + {formatCurrency(m.projectedProfit, "DOP")} previsto
                      </p>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>

          {/* -- El mes elegido -------------------------------------- */}
          <div className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <span className="capitalize">{nombreMes(mes.period)}</span>
            </p>

            {/* Tres preguntas distintas, tres cifras. Cuanto ENTRO no es lo
                mismo que cuanto GANASTE, y ninguna de las dos es lo que falta
                por cobrar. */}
            <div className="mt-2 grid grid-cols-1 divide-y divide-border/60 rounded-lg border border-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Cobrado
                </p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {formatCurrency(mes.collected, "DOP")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {mes.payments} {mes.payments === 1 ? "pago" : "pagos"} recibidos
                </p>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Ganancia confirmada
                </p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {formatCurrency(mes.profit, "DOP")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {mes.sessions}{" "}
                  {mes.sessions === 1
                    ? "sesion cobrada completa"
                    : "sesiones cobradas completas"}
                </p>
              </div>
              <div className="px-3 py-2.5">
                <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <CalendarClock className="size-3" />
                  Previsto
                </p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {mes.projectedProfit > 0
                    ? `+ ${formatCurrency(mes.projectedProfit, "DOP")}`
                    : "\u2014"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {mes.projectedSessions}{" "}
                  {mes.projectedSessions === 1
                    ? "sesion sin terminar de pagar"
                    : "sesiones sin terminar de pagar"}
                </p>
              </div>
            </div>

            {mes.projectedProfit > 0 ? (
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                Si todas pagan, el mes cierra en{" "}
                <strong className="tabular-nums text-foreground">
                  {formatCurrency(mes.profit + mes.projectedProfit, "DOP")}
                </strong>{" "}
                de ganancia.
              </p>
            ) : null}

            {detalle.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {detalle.map((d) => (
                  <span
                    key={d.packageId}
                    className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {planPorId.get(d.packageId)?.packageName ?? "(plan eliminado)"}{" "}
                    <strong className="tabular-nums text-foreground">
                      {formatCurrency(d.profit + d.projectedProfit, "DOP")}
                    </strong>
                  </span>
                ))}
              </div>
            ) : null}

            {sesiones.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-border/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-1.5 pr-3 text-left font-medium">
                        Cliente y plan
                      </th>
                      <th className="px-3 py-1.5 text-right font-medium">Cobrado</th>
                      <th className="py-1.5 pl-3 text-right font-medium">Ganancia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {sesiones.map((r) => {
                      const previsto = r.status === "previsto"
                      return (
                        <tr key={r.projectId}>
                          <td className="py-1.5 pr-3">
                            <p className="font-medium text-foreground">
                              {r.clientName ?? "(sin cliente)"}
                              {previsto ? (
                                <span className="ml-1.5 rounded-full bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                  falta que pague
                                </span>
                              ) : null}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {r.packageName ?? "(sin plan)"}
                              {r.date ? ` \u00b7 ${fechaCorta(r.date)}` : ""}
                            </p>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            <span className="text-foreground">
                              {formatCurrency(r.paid, "DOP")}
                            </span>
                            {previsto ? (
                              <span className="block text-[11px] text-muted-foreground">
                                de {formatCurrency(r.total, "DOP")}
                              </span>
                            ) : null}
                          </td>
                          <td
                            className={cn(
                              "py-1.5 pl-3 text-right font-semibold tabular-nums",
                              previsto ? "text-muted-foreground" : "text-foreground",
                            )}
                          >
                            {previsto ? "+ " : ""}
                            {formatCurrency(r.profit, "DOP")}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-[12.5px] text-muted-foreground">
                Este mes no tiene sesiones cobradas ni registradas.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Sin fecha no hay mes al que asignarlas: se dicen aparte para que no
          desaparezcan del radar. */}
      {unscheduled.sessions > 0 ? (
        <p className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
          <CircleHelp className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {unscheduled.sessions}{" "}
            {unscheduled.sessions === 1 ? "sesión" : "sesiones"} sin fecha y sin
            terminar de pagar ({formatCurrency(unscheduled.profit, "DOP")}). Sin fecha
            no se pueden proyectar a ningún mes — ponles fecha y aparecerán.
          </span>
        </p>
      ) : null}

      {/* Referencia por plan: plegada, porque responde otra pregunta. */}
      {plans.length > 0 ? (
        <div className="sf-card overflow-hidden">
          <button
            type="button"
            onClick={() => setVerPlanes((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-accent/25"
          >
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                verPlanes && "rotate-180",
              )}
            />
            <span className="text-[13px] font-medium text-foreground">
              Cuánto deja cada plan
            </span>
            <span className="ml-auto text-[11.5px] text-muted-foreground">
              {plans.length} planes
            </span>
          </button>

          {verPlanes ? (
            <ul className="divide-y divide-border/60 border-t border-border/70">
              {plans.map((p) => (
                <li
                  key={p.packageId}
                  className="flex items-baseline justify-between gap-3 px-4 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-foreground">
                      {p.packageName}
                    </span>
                    {p.categoryName ? (
                      <span className="block text-[11px] text-muted-foreground">
                        {p.categoryName}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right text-[12px] tabular-nums">
                    <span className="block text-foreground">
                      {formatCurrency(p.profit, "DOP")}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      precio {formatCurrency(p.price, "DOP")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="sf-card p-4 text-[13px] text-muted-foreground">
          Ningún plan tiene ganancia declarada todavía. Ponla en{" "}
          <strong className="text-foreground">Configuración → Paquetes</strong>,
          campo «Ganancia de este plan», y este apartado se llena solo.
        </div>
      )}
    </section>
  )
}
