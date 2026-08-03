import { CalendarCheck, Clock3, PiggyBank } from "lucide-react"

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tarjeta
          label={`10% de ${nombreMes(thisMonth.period)}`}
          value={formatCurrency(thisMonth.tithe)}
          hint={`${thisMonth.sessions} ${thisMonth.sessions === 1 ? "sesión saldada" : "sesiones saldadas"} · ${formatCurrency(thisMonth.profit)} de ganancia`}
          icon={<PiggyBank className="size-4" />}
          tone="positive"
        />
        <Tarjeta
          label={`10% de ${nombreMes(lastMonth.period)}`}
          value={formatCurrency(lastMonth.tithe)}
          hint={`${lastMonth.sessions} ${lastMonth.sessions === 1 ? "sesión saldada" : "sesiones saldadas"} · ${formatCurrency(lastMonth.profit)} de ganancia`}
          icon={<CalendarCheck className="size-4" />}
          tone="neutral"
        />
        <Tarjeta
          label="10% en camino"
          value={formatCurrency(pending.tithe)}
          hint={`${pending.sessions} ${pending.sessions === 1 ? "sesión" : "sesiones"} con saldo pendiente`}
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
                  <Th>Ganancia</Th>
                  <Th>10% por sesión</Th>
                  <Th>{nombreMes(lastMonth.period)}</Th>
                  <Th>{nombreMes(thisMonth.period)}</Th>
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
                        {r.sessionsLastMonth > 0
                          ? `${formatCurrency(r.titheLastMonth)} · ${r.sessionsLastMonth}`
                          : "—"}
                      </Td>
                      <Td
                        strong={activo}
                        muted={!activo}
                        className={activo ? "text-emerald-600 dark:text-emerald-400" : undefined}
                      >
                        {activo
                          ? `${formatCurrency(r.titheThisMonth)} · ${r.sessionsThisMonth}`
                          : "—"}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/40">
                  <td className="px-4 py-2.5 text-[12px] font-medium text-muted-foreground">
                    {conMovimiento.length} de {rows.length} planes con sesiones
                    saldadas
                  </td>
                  <td />
                  <td />
                  <td />
                  <Td strong>{formatCurrency(lastMonth.tithe)}</Td>
                  <Td strong>{formatCurrency(thisMonth.tithe)}</Td>
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
}: {
  label: string
  value: string
  hint: string
  icon: React.ReactNode
  tone: "positive" | "warning" | "neutral"
}) {
  const iconClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "warning"
        ? "text-amber-500"
        : "text-muted-foreground"
  return (
    <div className="sf-card p-4">
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
