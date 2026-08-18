import "server-only"

import { untypedService } from "@/server/supabase/untyped"

/**
 * ¿Esta sesión ya está saldada?
 *
 * Una sola definición para todo el sistema, porque antes había dos y las dos
 * estaban mal: comparaban lo pagado contra `projects.total_amount`, el precio
 * de lista de la sesión.
 *
 * El problema es que ese precio se mueve —al cambiarle el plan a una clienta,
 * por ejemplo— y la factura ya emitida no. Elida quedó facturada en 58,600,
 * pagó los 58,600 completos, y el sistema seguía diciendo que debía porque su
 * sesión decía 64,900. La clienta no debía nada: nadie le pidió esa diferencia.
 *
 * Lo que la clienta debe es LO QUE SE LE FACTURÓ. Si todavía no se le ha
 * facturado nada, se cae al precio de la sesión (que es 0 pagado contra el
 * precio: no saldada, correcto).
 *
 * OJO con el otro lado: si el estudio factura de menos —MAYCOL, 12,000 de una
 * sesión de 24,000— la sesión cuenta como saldada porque el cliente no debe
 * nada. Eso es cierto desde la cuenta del cliente; el hueco es de facturación
 * y se ve comparando `invoiced` con el precio de la sesión.
 */

export interface Settlement {
  /** Lo que se le facturó (facturas vivas, sin las canceladas). */
  invoiced: number
  /** Lo que lleva pagado. */
  paid: number
  /** Lo que se le pidió de verdad: lo facturado, o el precio si no hay factura. */
  owed: number
  settled: boolean
  /** Fecha del último pago confirmado. Marca el mes en que la sesión cerró. */
  lastPaymentAt: string | null
}

/** Margen de un peso: un redondeo no puede impedir que una sesión cierre. */
const MARGEN = 1

export async function getSessionSettlements(
  studioId: string,
  proyectos: Array<{ id: string; total: number }>,
): Promise<Map<string, Settlement>> {
  const out = new Map<string, Settlement>()
  for (const p of proyectos) {
    out.set(p.id, {
      invoiced: 0,
      paid: 0,
      owed: p.total,
      settled: false,
      lastPaymentAt: null,
    })
  }
  if (proyectos.length === 0) return out

  const sb = untypedService()
  const ids = proyectos.map((p) => p.id)

  const { data: invRaw } = await sb
    .from("invoices")
    .select("id, project_id, total, status")
    .eq("studio_id", studioId)
    .in("project_id", ids)
    .is("deleted_at", null)
  const facturas = ((invRaw ?? []) as Array<{
    id: string
    project_id: string | null
    total: number | string | null
    status: string | null
  }>).filter((f) => f.status !== "cancelled")

  const proyectoDeFactura = new Map<string, string>()
  for (const f of facturas) {
    if (!f.project_id) continue
    proyectoDeFactura.set(f.id, f.project_id)
    const acc = out.get(f.project_id)
    if (acc) acc.invoiced += Number(f.total ?? 0)
  }

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
    for (const pg of (payRaw ?? []) as Array<{
      invoice_id: string
      amount: number | string
      received_at: string | null
    }>) {
      const projectId = proyectoDeFactura.get(pg.invoice_id)
      if (!projectId) continue
      const acc = out.get(projectId)
      if (!acc) continue
      acc.paid += Number(pg.amount ?? 0)
      if (pg.received_at && (!acc.lastPaymentAt || pg.received_at > acc.lastPaymentAt)) {
        acc.lastPaymentAt = pg.received_at
      }
    }
  }

  for (const [, acc] of out) {
    acc.owed = acc.invoiced > 0 ? acc.invoiced : acc.owed
    acc.settled = acc.owed > 0 && acc.paid + MARGEN >= acc.owed
  }
  return out
}

/** La misma cuenta, para una sola sesión. */
export async function getSessionSettlement(
  studioId: string,
  projectId: string,
  total: number,
): Promise<Settlement> {
  const m = await getSessionSettlements(studioId, [{ id: projectId, total }])
  return (
    m.get(projectId) ?? {
      invoiced: 0,
      paid: 0,
      owed: total,
      settled: false,
      lastPaymentAt: null,
    }
  )
}
