import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { getFinanzAppWorkspaceId } from "./finanzapp-bridge.service"

/**
 * Apartado del 10% definido a mano en cada plan.
 *
 * Cómo funciona:
 *   · En el plan se escribe cuánto se aparta por una sesión de ese plan.
 *   · Cuando la sesión queda TOTALMENTE PAGADA, ese monto viaja a FinanzApp
 *     y se suma a lo que hay que apartar del mes.
 *   · Si el plan no tiene monto (o es 0), no pasa nada.
 *
 * Los pagos del CRM ya entran a FinanzApp con `aplica_diezmo = false`, así que
 * este monto no se suma a ningún porcentaje automático: es el único apartado
 * que genera la sesión.
 *
 * Idempotente: la clave es `crm-tithe:<projectId>`. Si se vuelve a llamar (otro
 * pago, un reintento), actualiza la misma fila en vez de duplicarla.
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
  titheAmount: number
  totalAmount: number
  paidAmount: number
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
      "id, name, total_amount, package_id, client:clients(name), package:packages(name, tithe_amount)",
    )
    .eq("id", projectId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!proj) return null

  const p = proj as {
    name: string
    total_amount: number | string | null
    client: { name?: string } | Array<{ name?: string }> | null
    package:
      | { name?: string; tithe_amount?: number | string | null }
      | Array<{ name?: string; tithe_amount?: number | string | null }>
      | null
  }
  const pkg = Array.isArray(p.package) ? p.package[0] : p.package
  const cli = Array.isArray(p.client) ? p.client[0] : p.client

  const titheAmount = Number(pkg?.tithe_amount ?? 0)
  if (!Number.isFinite(titheAmount) || titheAmount <= 0) return null

  // Cobrado real = pagos confirmados de las facturas de la sesión.
  const { data: invoices } = await sb
    .from("invoices")
    .select("id")
    .eq("studio_id", studioId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
  const invoiceIds = ((invoices ?? []) as Array<{ id: string }>).map((i) => i.id)
  if (invoiceIds.length === 0) return null

  const { data: pays } = await sb
    .from("payments")
    .select("amount")
    .eq("studio_id", studioId)
    .in("invoice_id", invoiceIds)
    .eq("status", "completed")
  const paidAmount = ((pays ?? []) as Array<{ amount: number | string }>).reduce(
    (s, r) => s + Number(r.amount ?? 0),
    0,
  )

  return {
    projectName: p.name,
    clientName: cli?.name ?? null,
    packageName: pkg?.name ?? null,
    titheAmount,
    totalAmount: Number(p.total_amount ?? 0),
    paidAmount,
  }
}

/**
 * Registra el apartado si la sesión ya quedó saldada. Best-effort: nunca
 * bloquea el registro del pago.
 */
export async function recordTitheSetAsideIfFullyPaid(
  studioId: string,
  projectId: string,
): Promise<{ recorded: boolean; reason?: string }> {
  const fin = await loadProjectFinance(studioId, projectId)
  if (!fin) return { recorded: false, reason: "el plan no define monto a apartar" }

  // "Saldada" con un margen de un peso, para que un redondeo no lo impida.
  if (fin.totalAmount <= 0 || fin.paidAmount + 1 < fin.totalAmount) {
    return { recorded: false, reason: "la sesión todavía tiene saldo" }
  }

  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return { recorded: false, reason: "FinanzApp no conectado" }

  const descripcion = fin.clientName
    ? `${fin.clientName} — ${fin.packageName ?? fin.projectName}`
    : fin.projectName

  const sb = untypedService()
  const { error } = await sb.rpc("finz_record_tithe_setaside", {
    p_workspace_id: workspaceId,
    p_periodo: periodoRD(),
    p_descripcion: descripcion,
    p_monto: fin.titheAmount,
    p_external_reference: `crm-tithe:${projectId}`,
    p_notas: "Apartado definido en el plan · sesión saldada (CRM)",
  })
  if (error) {
    console.error("[tithe-setaside] no se pudo registrar", error)
    return { recorded: false, reason: "error al registrar en Finanzas" }
  }

  return { recorded: true }
}
