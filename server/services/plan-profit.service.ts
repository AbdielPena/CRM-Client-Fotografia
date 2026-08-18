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
 * La ganancia de cada sesion es la DECLARADA en su plan, tal cual. No se
 * recalcula sobre lo cobrado: sin historial de precios no se puede distinguir
 * una sesion vendida al precio viejo de una con descuento, y adivinar hacia
 * abajo hacia que un plan de 30,900 reportara 24,600.
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
  /** COBRADO: todo el dinero que entro ese mes, abonos incluidos. */
  collected: number
  payments: number
}

/** Una sesion dentro de un mes: quien, que plan, cuanto pago, cuanto deja. */
export interface MonthClientRow {
  projectId: string
  clientName: string | null
  projectName: string | null
  packageName: string | null
  /** Precio de la sesion. */
  total: number
  /** Lo que lleva pagado. */
  paid: number
  profit: number
  /** 'confirmado' = ya pago todo. 'previsto' = todavia debe. */
  status: "confirmado" | "previsto"
  /** Fecha del ultimo pago (confirmado) o de la sesion (previsto). */
  date: string | null
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
  /** Las sesiones de cada mes, una por una. */
  byMonthClients: Record<string, MonthClientRow[]>
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

  const filas = new Map<string, PlanRef>()
  for (const p of packages) {
    const profit = Number(p.profit_amount ?? 0)
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
    .select("id, package_id, total_amount, event_date, name, client_id")
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
    name: string | null
    client_id: string | null
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
          collected: 0,
          payments: 0,
        },
      ],
      byMonth: { [actual]: [] },
      byMonthClients: { [actual]: [] },
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

  // Nombres de cliente para el detalle: sin ellos la lista no sirve de nada.
  const nombreCliente = new Map<string, string>()
  const idsCliente = [
    ...new Set(proyectos.map((p) => p.client_id).filter((x): x is string => !!x)),
  ]
  if (idsCliente.length > 0) {
    const { data: cliRaw } = await sb
      .from("clients")
      .select("id, name")
      .in("id", idsCliente)
    for (const c of (cliRaw ?? []) as Array<{ id: string; name: string | null }>) {
      if (c.name) nombreCliente.set(c.id, c.name)
    }
  }

  // COBRADO del mes: TODO el dinero que entro, abonos incluidos y aunque la
  // sesion no tenga plan. Es otra pregunta que la ganancia —cuanto entro por
  // la puerta— y tiene que cuadrar con la cifra de la pantalla de Finanzas.
  const cobradoMes = new Map<string, { monto: number; pagos: number }>()
  for (let desde = 0; ; desde += 1000) {
    const { data: todos } = await sb
      .from("payments")
      .select("amount, received_at")
      .eq("studio_id", studioId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .range(desde, desde + 999)
    const tanda = (todos ?? []) as Array<{
      amount: number | string
      received_at: string | null
    }>
    for (const pg of tanda) {
      if (!pg.received_at) continue
      const per = periodoRD(new Date(pg.received_at))
      const acc = cobradoMes.get(per) ?? { monto: 0, pagos: 0 }
      acc.monto += Number(pg.amount ?? 0)
      acc.pagos += 1
      cobradoMes.set(per, acc)
    }
    if (tanda.length < 1000) break
  }

  // ── Repartir cada sesión en su mes (o en "pendiente") ────────────────────
  const totales = new Map<string, { sessions: number; profit: number }>()
  const previstos = new Map<string, { sessions: number; profit: number }>()
  const porMes = new Map<string, Map<string, MonthPlanRow>>()
  const clientesMes = new Map<string, MonthClientRow[]>()
  const unscheduled = { sessions: 0, profit: 0 }

  /** Apunta una sesion en la lista de su mes. */
  const anotarCliente = (periodo: string, fila: MonthClientRow) => {
    const lista = clientesMes.get(periodo) ?? []
    lista.push(fila)
    clientesMes.set(periodo, lista)
  }

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

    // La ganancia declarada en el plan, sin recalcular.
    const ganancia = fila.profit

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
      anotarCliente(periodo, {
        projectId: proy.id,
        clientName: proy.client_id
          ? (nombreCliente.get(proy.client_id) ?? null)
          : null,
        projectName: proy.name,
        packageName: fila.packageName,
        total,
        paid: pagado,
        profit: ganancia,
        status: "previsto",
        date: proy.event_date,
      })
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
    anotarCliente(periodo, {
      projectId: proy.id,
      clientName: proy.client_id
        ? (nombreCliente.get(proy.client_id) ?? null)
        : null,
      projectName: proy.name,
      packageName: fila.packageName,
      total,
      paid: pagado,
      profit: ganancia,
      status: "confirmado",
      date: acc.ultimo,
    })
  }

  // La serie va del primer mes con movimiento al ultimo mes con algo previsto
  // —ahi esta la gracia: los meses que vienen aparecen antes de cobrarse.
  const conDatos = [...totales.keys(), ...previstos.keys(), ...cobradoMes.keys(), actual].sort()
  const periodos = serieDeMeses(conDatos[0], conDatos[conDatos.length - 1])

  const months: MonthTotals[] = periodos
    .map((period) => {
      const t = totales.get(period) ?? { sessions: 0, profit: 0 }
      const pr = previstos.get(period) ?? { sessions: 0, profit: 0 }
      const cb = cobradoMes.get(period) ?? { monto: 0, pagos: 0 }
      return {
        period,
        sessions: t.sessions,
        profit: t.profit,
        projectedSessions: pr.sessions,
        projectedProfit: pr.profit,
        collected: cb.monto,
        payments: cb.pagos,
      }
    })
    .reverse() // el mes mas reciente primero

  const byMonth: Record<string, MonthPlanRow[]> = {}
  for (const period of periodos) {
    byMonth[period] = [...(porMes.get(period)?.values() ?? [])].sort(
      (a, b) => b.profit + b.projectedProfit - (a.profit + a.projectedProfit),
    )
  }

  const byMonthClients: Record<string, MonthClientRow[]> = {}
  for (const period of periodos) {
    // Lo cobrado primero (es lo cierto), y dentro, lo que mas deja.
    byMonthClients[period] = [...(clientesMes.get(period) ?? [])].sort(
      (a, b) =>
        (a.status === b.status ? 0 : a.status === "confirmado" ? -1 : 1) ||
        b.profit - a.profit,
    )
  }

  return {
    plans: [...filas.values()].sort((a, b) => b.profit - a.profit),
    months,
    byMonth,
    byMonthClients,
    unscheduled,
  }
}
