"use client"

import * as React from "react"
import { ChevronDown, Clock3 } from "lucide-react"

import type { PlanProfitSummary } from "@/server/services/plan-profit.service"
import { formatCurrency } from "@/lib/utils/currency"
import { cn } from "@/lib/utils/cn"

/**
 * Ganancia por mes y por plan.
 *
 * Manda el MES: a la izquierda están todos, uno por línea con su monto; a la
 * derecha el detalle del que elijas. La referencia fija por plan (precio y
 * ganancia) es otra pregunta —sirve para poner precios, no para saber cómo te
 * fue— así que vive plegada abajo y no compite por la atención.
 *
 * Sin porcentajes: el estudio pidió ver la ganancia y nada más.
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

export function PlanProfitPanel({ data }: { data: PlanProfitSummary }) {
  const { plans, months, byMonth, pending } = data
  const [periodo, setPeriodo] = React.useState(months[0]?.period ?? "")
  const [verPlanes, setVerPlanes] = React.useState(false)

  const mes = months.find((m) => m.period === periodo) ?? months[0]
  const planPorId = React.useMemo(
    () => new Map(plans.map((p) => [p.packageId, p])),
    [plans],
  )
  const detalle = byMonth[periodo] ?? []
  // La barra compara meses entre sí: sin referencia, un monto suelto no dice
  // si fue un buen mes o no.
  const tope = Math.max(...months.map((m) => m.profit), 1)

  if (!mes) return null

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Ganancia por mes
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Una sesión suma el mes en que la clienta <strong>termina</strong> de
          pagar. Se calcula sobre lo que cobraste de verdad, así que subir un
          precio hoy no cambia lo que ganaste antes.
        </p>
      </div>

      <div className="sf-card overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,220px)_1fr]">
          {/* ── Los meses ─────────────────────────────────────────────── */}
          <ul className="border-b border-border/70 md:border-b-0 md:border-r">
            {months.map((m) => {
              const activo = m.period === periodo
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
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[12.5px] tabular-nums",
                          activo
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {m.profit > 0 ? formatCurrency(m.profit) : "—"}
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border/60">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          activo ? "bg-emerald-500" : "bg-emerald-500/40",
                        )}
                        style={{ width: `${Math.round((m.profit / tope) * 100)}%` }}
                      />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* ── El mes elegido ────────────────────────────────────────── */}
          <div className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              En <span className="capitalize">{nombreMes(mes.period)}</span> ganaste
            </p>
            <p className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">
              {formatCurrency(mes.profit)}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {mes.sessions}{" "}
              {mes.sessions === 1
                ? "sesión cobrada completa"
                : "sesiones cobradas completas"}
            </p>

            {detalle.length > 0 ? (
              <div className="mt-4">
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  De qué planes salió
                </p>
                <ul className="divide-y divide-border/60">
                  {detalle.map((d) => {
                    const plan = planPorId.get(d.packageId)
                    return (
                      <li
                        key={d.packageId}
                        className="flex items-baseline justify-between gap-3 py-1.5"
                      >
                        <span className="min-w-0 truncate text-[12.5px] text-foreground">
                          {plan?.packageName ?? "(plan eliminado)"}
                          <span className="ml-1.5 text-[11px] text-muted-foreground">
                            ×{d.sessions}
                          </span>
                        </span>
                        <span className="shrink-0 text-[12.5px] tabular-nums text-foreground">
                          {formatCurrency(d.profit)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-[12.5px] text-muted-foreground">
                Ninguna sesión terminó de pagarse en este mes.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Lo que todavía no cuenta. Va aparte y en una línea: es la confusión
          de siempre —el dinero de las reservas aún no es ganancia. */}
      {pending.sessions > 0 ? (
        <p className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
          <Clock3 className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong className="text-foreground">
              {formatCurrency(pending.profit)}
            </strong>{" "}
            en camino. Son {pending.sessions}{" "}
            {pending.sessions === 1 ? "sesión" : "sesiones"} sin terminar de
            pagar; todavía no cuentan en ningún mes.
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
                      {formatCurrency(p.profit)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      precio {formatCurrency(p.price)}
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
