import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { getFinanzAppWorkspaceId } from "./finanzapp-bridge.service"

/**
 * Ganancia por plan.
 *
 * Cómo funciona:
 *   · En el plan se escribe cuánto le queda LIMPIO al estudio por una sesión de
 *     ese plan (ya descontado todo: colaboradores, vestido, gastos).
 *   · Cuando la sesión queda TOTALMENTE PAGADA, ese monto viaja a FinanzApp y
 *     suma a la ganancia del mes ("este mes ganaste X").
 *   · Si el plan no tiene monto (o es 0), no pasa nada.
 *
 * Es un número que el dueño declara, no calculado: se suma tal cual.
 *
 * Idempotente: la clave es `crm-profit:<projectId>`. Si se vuelve a llamar (otro
 * pago, un reintento, un cambio de monto en el plan), actualiza la misma fila
 * en vez de duplicarla.
 */

/** Mes actual en RD, en formato 'YYYY-MM'. */
function periodoRD(): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
  })
  return f.format(new Date()).slice(0, 7)
}

type ProjectFinance = {
  projectName: string
  clientName: string | null
  packageName: string | null
  profitAmount: number
  totalAmount: number
  paidAmount: number
  settled: boolean
}

/** Lee lo que hace falta para decidir: monto del plan, total y cobrado. */
async function loadProjectFinance(
  studioId: string,
  projectId: string,
): Promise<ProjectFinance | null> {
  const sb = untypedService()

  const { data: proj } = await sb
    .from("projects")
    .select(
      "id, name, total_amount, package_id, profit_amount, client:clients(name), package:packages(name, profit_amount)",
    )
    .eq("id", projectId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!proj) return null

  const p = proj as {
    name: string
    total_amount: number | string | null
    profit_amount: number | string | null
    client: { name?: string } | Array<{ name?: string }> | null
    package:
      | { name?: string; profit_amount?: number | string | null }
      | Array<{ name?: string; profit_amount?: number | string | null }>
      | null
  }
  const pkg = Array.isArray(p.package) ? p.package[0] : p.package
  const cli = Array.isArray(p.client) ? p.client[0] : p.client

  // La ganancia de ESTA sesion manda sobre la del plan: si hubo descuento, el
  // estudio la ajusto ahi y es la que tiene que llegar a Finanzas.
  const propia = Number(p.profit_amount ?? NaN)
  const profitAmount = Number.isFinite(propia) && propia > 0
    ? propia
    : Number(pkg?.profit_amount ?? 0)
  if (!Number.isFinite(profitAmount) || profitAmount <= 0) return null

  // Saldada o no: la definición compartida del sistema. Compara contra lo
  // FACTURADO —lo que de verdad se le pidió— y no contra el precio de lista,
  // que se mueve al cambiarle el plan a una clienta y dejaba sesiones ya
  // pagadas sin registrar su ganancia.
  const { getSessionSettlement } = await import("./session-settlement.service")
  const saldo = await getSessionSettlement(
    studioId,
    projectId,
    Number(p.total_amount ?? 0),
  )
  if (saldo.invoiced <= 0) return null

  return {
    projectName: p.name,
    clientName: cli?.name ?? null,
    packageName: pkg?.name ?? null,
    profitAmount,
    totalAmount: saldo.owed,
    paidAmount: saldo.paid,
    settled: saldo.settled,
  }
}

/**
 * Registra la ganancia si la sesión ya quedó saldada. Best-effort: nunca
 * bloquea el registro del pago.
 */
export async function recordSessionProfitIfFullyPaid(
  studioId: string,
  projectId: string,
): Promise<{ recorded: boolean; reason?: string }> {
  const fin = await loadProjectFinance(studioId, projectId)
  if (!fin) return { recorded: false, reason: "el plan no define ganancia" }

  if (!fin.settled) {
    return { recorded: false, reason: "la sesión todavía tiene saldo" }
  }

  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return { recorded: false, reason: "FinanzApp no conectado" }

  const descripcion = fin.clientName
    ? `${fin.clientName} — ${fin.packageName ?? fin.projectName}`
    : fin.projectName

  const sb = untypedService()
  const { error } = await sb.rpc("finz_record_session_profit", {
    p_workspace_id: workspaceId,
    p_periodo: periodoRD(),
    p_descripcion: descripcion,
    p_monto: fin.profitAmount,
    p_external_reference: `crm-profit:${projectId}`,
    p_notas: "Ganancia declarada en el plan · sesión saldada (CRM)",
  })
  if (error) {
    console.error("[session-profit] no se pudo registrar", error)
    return { recorded: false, reason: "error al registrar en Finanzas" }
  }

  return { recorded: true }
}
