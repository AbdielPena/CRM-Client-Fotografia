import { CalendarCheck, Clock3, PiggyBank, Wallet } from "lucide-react"

import type { PlanTitheSummary } from "@/server/services/plan-profit-tithe.service"
import { formatCurrency } from "@/lib/utils/currency"

/**
 * Apartado "10% de la ganancia por plan".
 *
 * Responde dos preguntas distintas y las mantiene separadas a propósito:
 *   · Cuánto es el 10% de CADA plan (número fijo, sirve para decidir precios).
 *   · Cuánto suma ese 10% en el mes, contando solo las sesiones ya saldadas.
 *
 * Lo tercero — "en camino" — evita el malentendido de siempre: el dinero de las
 * reservas todavía no es ganancia, porque la sesión no se ha hecho ni cobrado
 * completa.
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

export function PlanProfitTithePanel({ data }: { data: PlanTitheSummary }) {
  const { rows, thisMonth, lastMonth, pending } = data
  const conMovimiento = rows.filter(
    (r) => r.sessionsThisMonth > 0 || r.sessionsLastMonth > 0,
  )

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          10% de la ganancia por plan
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Sobre la ganancia limpia que declaraste en cada plan. Una sesión suma
          el mes en que el cliente <strong>termina</strong> de pagar — un abono
          todavía no cuenta. Los totales del mes se calculan sobre lo que
          cobraste de verdad en cada sesión, así que subir un precio hoy no
          cambia lo que ganaste antes.
        </p>
      </div>

      {/* El orden importa: primero la ganancia TOTAL, y de ahí sale el 10%.
          Antes solo se veía el 10% y el total no aparecía en ningún sitio. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta
          label={`Ganancia de ${nombreMes(thisMonth.period)}`}
          value={formatCurrency(thisMonth.profit)}
          hint={`${thisMonth.sessions} ${thisMonth.sessions === 1 ? "sesión cobrada completa" : "sesiones cobradas completas"}`}
          icon={<Wallet className="size-4" />}
          tone="neutral"
        />
        <Tarjeta
          label="10% de esa ganancia"
          value={formatCurrency(thisMonth.tithe)}
          hint={`El 10% del total de ${formatCurrency(thisMonth.profit)}`}
          icon={<PiggyBank className="size-4" />}
          tone="positive"
          destacada
        />
        <Tarjeta
          label={`Ganancia de ${nombreMes(lastMonth.period)}`}
          value={formatCurrency(lastMonth.profit)}
          hint={`Su 10% fue ${formatCurrency(lastMonth.tithe)} · ${lastMonth.sessions} ${lastMonth.sessions === 1 ? "sesión" : "sesiones"}`}
          icon={<CalendarCheck className="size-4" />}
          tone="neutral"
        />
        <Tarjeta
          label="Ganancia en camino"
          value={formatCurrency(pending.profit)}
          hint={`Su 10% será ${formatCurrency(pending.tithe)} · ${pending.sessions} ${pending.sessions === 1 ? "sesión" : "sesiones"} sin terminar de pagar`}
          icon={<Clock3 className="size-4" />}
          tone="warning"
        />
      </div>

      {rows.length === 0 ? (
        <div className="sf-card p-5 text-[13px] text-muted-foreground">
          Ningún plan tiene ganancia declarada todavía. Ponla en{" "}
          <strong className="text-foreground">
            Configuración → Paquetes
          </strong>
          , campo «Ganancia de este plan», y este apartado se llena solo.
        </div>
      ) : (
        <div className="sf-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <Th className="text-left">Plan</Th>
                  <Th>Precio</Th>
                  <Th>Ganancia por sesión</Th>
                  <Th>10% por sesión</Th>
                  <Th>{`Ganancia ${nombreMes(lastMonth.period)}`}</Th>
                  <Th>{`Ganancia ${nombreMes(thisMonth.period)}`}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const activo = r.sessionsThisMonth > 0
                  return (
                    <tr
                      key={r.packageId}
                      className="border-b border-border/60 last:border-0 hover:bg-accent/30"
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-foreground">
                          {r.packageName}
                        </p>
                        {r.categoryName && (
                          <p className="text-[11px] text-muted-foreground">
                            {r.categoryName}
                          </p>
                        )}
                      </td>
                      <Td muted>{formatCurrency(r.price)}</Td>
                      <Td>{formatCurrency(r.profit)}</Td>
                      <Td strong>{formatCurrency(r.tithe)}</Td>
                      <Td muted={r.sessionsLastMonth === 0}>
                        {r.sessionsLastMonth > 0 ? (
                          <>
                            {formatCurrency(r.profitLastMonth)}
                            <span className="ml-1 text-[11px] text-muted-foreground">
                              ({r.sessionsLastMonth})
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td
                        strong={activo}
                        muted={!activo}
                        className={activo ? "text-emerald-600 dark:text-emerald-400" : undefined}
                      >
                        {activo ? (
                          <>
                            {formatCurrency(r.profitThisMonth)}
                            <span className="ml-1 text-[11px] font-normal opacity-70">
                              ({r.sessionsThisMonth})
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/40">
                  <td className="px-4 py-2.5 text-[12px] font-medium text-muted-foreground">
                    TOTAL de ganancia · {conMovimiento.length} de {rows.length}{" "}
                    planes con sesiones cobradas
                  </td>
                  <td />
                  <td />
                  <td />
                  <Td strong>{formatCurrency(lastMonth.profit)}</Td>
                  <Td strong>{formatCurrency(thisMonth.profit)}</Td>
                </tr>
                {/* La fila que el estudio venía a buscar: el 10% calculado
                    sobre el TOTAL de arriba, no plan por plan. */}
                <tr className="border-t-2 border-emerald-500/40 bg-emerald-500/10">
                  <td className="px-4 py-3 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">
                    10% DEL TOTAL DE GANANCIA
                  </td>
                  <td />
                  <td />
                  <td />
                  <Td strong className="text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(lastMonth.tithe)}
                  </Td>
                  <Td strong className="text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(thisMonth.tithe)}
                  </Td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function Th({
  children,
  className = "text-right",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      className={`px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground ${className}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  muted,
  strong,
  className = "",
}: {
  children: React.ReactNode
  muted?: boolean
  strong?: boolean
  className?: string
}) {
  return (
    <td
      className={`px-4 py-2.5 text-right tabular-nums ${
        strong ? "font-semibold" : ""
      } ${muted ? "text-muted-foreground" : ""} ${className}`}
    >
      {children}
    </td>
  )
}

function Tarjeta({
  label,
  value,
  hint,
  icon,
  tone,
  destacada,
}: {
  label: string
  value: string
  hint: string
  icon: React.ReactNode
  tone: "positive" | "warning" | "neutral"
  destacada?: boolean
}) {
  const iconClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "warning"
        ? "text-amber-500"
        : "text-muted-foreground"
  return (
    <div
      className={`sf-card p-4 ${
        destacada
          ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
          : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={iconClass}>{icon}</span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  )
}
