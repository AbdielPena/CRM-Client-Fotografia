import "server-only"

import { untypedService } from "@/server/supabase/untyped"

/**
 * Ganancia por mes y por plan, confirmada y prevista.
 *
 * Sale de la **ganancia limpia** que el dueño declaró en cada plan
 * (`packages.profit_amount`). Nada de porcentajes: el estudio pidió ver la
 * ganancia y punto.
 *
 * Dos números por mes, que NUNCA se funden en uno:
 *
 *   · CONFIRMADO — la sesión quedó TOTALMENTE pagada, y suma en el mes del
 *     último pago. Un abono no cuenta: el dinero adelantado todavía no es
 *     ganancia. Es la misma regla de `session-profit.service.ts`.
 *   · PREVISTO — la sesión está registrada pero aún debe. Se proyecta al mes
 *     de la FECHA DE LA SESIÓN, porque el saldo se paga ese día. Si esa fecha
 *     ya pasó y sigue sin saldar, se proyecta al mes en curso: el dinero no
 *     entró, se espera ahora.
 *
 * Sumarlos en una cifra sola haría creer que ya se ganó algo que no ha
 * entrado, así que el servicio los devuelve separados y la pantalla también.
 *
 * OJO con los meses pasados. La ganancia del plan es un número de HOY; si se
 * sube el precio, aplicarlo hacia atrás inflaría lo que de verdad se ganó. Por
 * eso cada sesión se calcula sobre lo que se le COBRÓ a esa clienta:
 *
 *     gastos del plan = precio de hoy − ganancia de hoy   (lo que no cambia
 *                                                          al subir el precio)
 *     ganancia real   = lo cobrado en esa sesión − gastos del plan
 *
 * Con eso una sesión vendida al precio viejo sigue reportando la ganancia
 * vieja, y una con descuento reporta menos.
 */

/** Mes 'YYYY-MM' en hora de República Dominicana. */
function periodoRD(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
  })
    .format(fecha)
    .slice(0, 7)
}

/**
 * Todos los meses entre el primero con movimiento y el mes en curso, sin
 * huecos. Un mes en cero es informacion: dice que ese mes no cerro nada.
 */
function serieDeMeses(primero: string, ultimo: string): string[] {
  const [ya, ma] = primero.split("-").map(Number)
  const [yb, mb] = ultimo.split("-").map(Number)
  const out: string[] = []
  for (let y = ya, m = ma; y < yb || (y === yb && m <= mb); ) {
    out.push(`${y}-${String(m).padStart(2, "0")}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/** La referencia fija de un plan: no depende del mes. */
export interface PlanRef {
  packageId: string
  packageName: string
  categoryName: string | null
  price: number
  /** Ganancia limpia declarada en el plan. */
  profit: number
}

export interface MonthTotals {
  /** 'YYYY-MM' en hora RD. */
  period: string
  /** CONFIRMADO: sesiones que ya se cobraron completas. */
  sessions: number
  profit: number
  /** PREVISTO: sesiones registradas que aun no terminan de pagar. */
  projectedSessions: number
  projectedProfit: number
}

/** Lo que aporto (o aportara) un plan en UN mes. */
export interface MonthPlanRow {
  packageId: string
  sessions: number
  profit: number
  projectedSessions: number
  projectedProfit: number
}

export interface PlanProfitSummary {
  plans: PlanRef[]
  /** Serie mensual completa, del mes mas reciente al mas viejo. */
  months: MonthTotals[]
  /** Desglose por plan de cada mes, indexado por periodo. */
  byMonth: Record<string, MonthPlanRow[]>
  /**
   * Sesiones sin saldar y SIN fecha: no hay a que mes asignarlas, asi que no
   * entran en ninguna proyeccion. Se reportan aparte para que no desaparezcan.
   */
  unscheduled: { sessions: number; profit: number }
}

interface PkgRow {
  id: string
  name: string | null
  price: number | string | null
  profit_amount: number | string | null
  is_active: boolean | null
  service_category_id: string | null
}

export async function getPlanProfit(
  studioId: string,
): Promise<PlanProfitSummary> {
  const sb = untypedService()
  const actual = periodoRD(new Date())

  // ── Planes con ganancia declarada ────────────────────────────────────────
  const [{ data: pkgsRaw }, { data: catsRaw }] = await Promise.all([
    sb
      .from("packages")
      .select("id, name, price, profit_amount, is_active, service_category_id")
      .eq("studio_id", studioId)
      .is("deleted_at", null),
    sb.from("service_categories").select("id, name").eq("studio_id", studioId),
  ])
  const packages = (pkgsRaw ?? []) as PkgRow[]
  const categorias = new Map(
    ((catsRaw ?? []) as Array<{ id: string; name: string | null }>).map((c) => [
      c.id,
      c.name,
    ]),
  )

  // Gastos del plan = precio − ganancia. Es lo que NO cambia cuando se sube el
  // precio, y con eso se reconstruye la ganancia real de cada sesión vendida.
  const gastosDelPlan = new Map<string, number>()

  const filas = new Map<string, PlanRef>()
  for (const p of packages) {
    const profit = Number(p.profit_amount ?? 0)
    gastosDelPlan.set(p.id, Math.max(0, Number(p.price ?? 0) - profit))
    // Sin ganancia declarada no hay 10% que mostrar; los inactivos tampoco
    // aportan (no se pueden vender), salvo que aún tengan sesiones del mes.
    if (!(profit > 0)) continue
    filas.set(p.id, {
      packageId: p.id,
      packageName: p.name ?? "(sin nombre)",
      categoryName: p.service_category_id
        ? (categorias.get(p.service_category_id) ?? null)
        : null,
      price: Number(p.price ?? 0),
      profit,
    })
  }

  // ── Sesiones vivas con plan y monto ──────────────────────────────────────
  const { data: projRaw } = await sb
    .from("projects")
    .select("id, package_id, total_amount, event_date")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .is("cancelled_at", null)
    .not("package_id", "is", null)
    .gt("total_amount", 0)
  const proyectos = (projRaw ?? []) as Array<{
    id: string
    package_id: string
    total_amount: number | string
    event_date: string | null
  }>
  if (proyectos.length === 0) {
    return {
      plans: [...filas.values()],
      months: [
        {
          period: actual,
          sessions: 0,
          profit: 0,
          projectedSessions: 0,
          projectedProfit: 0,
        },
      ],
      byMonth: { [actual]: [] },
      unscheduled: { sessions: 0, profit: 0 },
    }
  }

  // ── Cobrado real por sesión: pagos confirmados de sus facturas ───────────
  const idsProyecto = proyectos.map((p) => p.id)
  const { data: invRaw } = await sb
    .from("invoices")
    .select("id, project_id")
    .eq("studio_id", studioId)
    .in("project_id", idsProyecto)
    .is("deleted_at", null)
  const facturas = (invRaw ?? []) as Array<{
    id: string
    project_id: string | null
  }>
  const facturaDeProyecto = new Map(
    facturas.map((f) => [f.id, f.project_id ?? ""]),
  )

  const cobrado = new Map<string, { pagado: number; ultimo: string | null }>()
  if (facturas.length > 0) {
    const { data: payRaw } = await sb
      .from("payments")
      .select("invoice_id, amount, received_at")
      .eq("studio_id", studioId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .in(
        "invoice_id",
        facturas.map((f) => f.id),
      )
    for (const p of (payRaw ?? []) as Array<{
      invoice_id: string
      amount: number | string
      received_at: string | null
    }>) {
      const projectId = facturaDeProyecto.get(p.invoice_id)
      if (!projectId) continue
      const acc = cobrado.get(projectId) ?? { pagado: 0, ultimo: null }
      acc.pagado += Number(p.amount ?? 0)
      if (p.received_at && (!acc.ultimo || p.received_at > acc.ultimo)) {
        acc.ultimo = p.received_at
      }
      cobrado.set(projectId, acc)
    }
  }

  // ── Repartir cada sesión en su mes (o en "pendiente") ────────────────────
  const totales = new Map<string, { sessions: number; profit: number }>()
  const previstos = new Map<string, { sessions: number; profit: number }>()
  const porMes = new Map<string, Map<string, MonthPlanRow>>()
  const unscheduled = { sessions: 0, profit: 0 }

  /** Fila de un plan dentro de un mes, creandola si hace falta. */
  const filaDelMes = (periodo: string, packageId: string): MonthPlanRow => {
    const delMes = porMes.get(periodo) ?? new Map<string, MonthPlanRow>()
    const fp = delMes.get(packageId) ?? {
      packageId,
      sessions: 0,
      profit: 0,
      projectedSessions: 0,
      projectedProfit: 0,
    }
    delMes.set(packageId, fp)
    porMes.set(periodo, delMes)
    return fp
  }

  for (const proy of proyectos) {
    const fila = filas.get(proy.package_id)
    if (!fila) continue
    const total = Number(proy.total_amount ?? 0)
    const acc = cobrado.get(proy.id)
    const pagado = acc?.pagado ?? 0

    // Ganancia REAL de esta sesión, sobre lo que se le cobró a esta clienta.
    // Si la sesión se vendió antes de un aumento, reporta la ganancia de
    // entonces; si llevó descuento, reporta menos. Nunca menos de cero.
    const gastos = gastosDelPlan.get(proy.package_id) ?? 0
    const ganancia = total > 0 ? Math.max(0, total - gastos) : fila.profit

    // Margen de un peso: un redondeo no debe impedir que cuente.
    const saldada = total > 0 && pagado + 1 >= total
    if (!saldada) {
      // Todavia debe: se PROYECTA al mes en que se espera cobrarla. El ancla
      // es la fecha de la sesion, porque el saldo se paga ese dia. Si esa
      // fecha ya paso y sigue sin saldar, se espera cobrarla ahora.
      if (!proy.event_date) {
        unscheduled.sessions += 1
        unscheduled.profit += ganancia
        continue
      }
      const dela = periodoRD(new Date(`${proy.event_date}T12:00:00`))
      const periodo = dela < actual ? actual : dela
      const pr = previstos.get(periodo) ?? { sessions: 0, profit: 0 }
      pr.sessions += 1
      pr.profit += ganancia
      previstos.set(periodo, pr)

      const fp = filaDelMes(periodo, proy.package_id)
      fp.projectedSessions += 1
      fp.projectedProfit += ganancia
      continue
    }
    if (!acc?.ultimo) continue
    const periodo = periodoRD(new Date(acc.ultimo))

    const t = totales.get(periodo) ?? { sessions: 0, profit: 0 }
    t.sessions += 1
    t.profit += ganancia
    totales.set(periodo, t)

    const fp = filaDelMes(periodo, proy.package_id)
    fp.sessions += 1
    fp.profit += ganancia
  }

  // La serie va del primer mes con movimiento al ultimo mes con algo previsto
  // —ahi esta la gracia: los meses que vienen aparecen antes de cobrarse.
  const conDatos = [...totales.keys(), ...previstos.keys(), actual].sort()
  const periodos = serieDeMeses(conDatos[0], conDatos[conDatos.length - 1])

  const months: MonthTotals[] = periodos
    .map((period) => {
      const t = totales.get(period) ?? { sessions: 0, profit: 0 }
      const pr = previstos.get(period) ?? { sessions: 0, profit: 0 }
      return {
        period,
        sessions: t.sessions,
        profit: t.profit,
        projectedSessions: pr.sessions,
        projectedProfit: pr.profit,
      }
    })
    .reverse() // el mes mas reciente primero

  const byMonth: Record<string, MonthPlanRow[]> = {}
  for (const period of periodos) {
    byMonth[period] = [...(porMes.get(period)?.values() ?? [])].sort(
      (a, b) => b.profit + b.projectedProfit - (a.profit + a.projectedProfit),
    )
  }

  return {
    plans: [...filas.values()].sort((a, b) => b.profit - a.profit),
    months,
    byMonth,
    unscheduled,
  }
}
