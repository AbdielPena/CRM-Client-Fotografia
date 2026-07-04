import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"

/**
 * Puente CRM → FinanzApp (fi.abbypixel.com).
 *
 * Decisión de producto: hay UN solo módulo de finanzas y es FinanzApp.
 * Los pagos de facturas del CRM se registran como ingresos en
 * finanzapp.transactions (schema de la app externa, mismo Postgres),
 * contra las cuentas REALES del usuario (finanzapp.accounts).
 *
 * Acceso: vía RPCs `finz_list_accounts` / `finz_record_income` en public
 * (SECURITY DEFINER, EXECUTE solo para service_role) — por eso TODAS las
 * funciones de este service usan untypedService(), nunca el server client.
 *
 * Idempotencia: external_reference = `crm-payment:<paymentId>` con índice
 * único en finanzapp.transactions. Pagos parciales = un ingreso por pago;
 * retries (doble click, webhook reenviado) no duplican.
 */

export type FinanzAppAccount = {
  id: string
  nombre: string
  banco: string | null
  tipo: string | null
}

/** Workspace de FinanzApp mapeado al studio (studios.finanzapp_workspace_id). */
export async function getFinanzAppWorkspaceId(
  studioId: string,
): Promise<string | null> {
  const sb = untypedService()
  const { data, error } = await sb
    .from("studios")
    .select("finanzapp_workspace_id")
    .eq("id", studioId)
    .maybeSingle()

  if (error) throwServiceError("FINZ_BRIDGE_OP_FAILED", error, { studioId })
  return (data?.finanzapp_workspace_id as string | null) ?? null
}

/**
 * Cuentas activas del workspace de FinanzApp (para el selector "Cuenta
 * destino" del modal de pago y el default de /settings). Si el studio no
 * tiene workspace mapeado, devuelve [] — el modal simplemente no muestra
 * selector y el pago sigue funcionando.
 */
export async function listFinanzAppAccounts(
  studioId: string,
): Promise<FinanzAppAccount[]> {
  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return []

  const sb = untypedService()
  const { data, error } = await sb.rpc("finz_list_accounts", {
    p_workspace_id: workspaceId,
  })

  if (error) throwServiceError("FINZ_BRIDGE_OP_FAILED", error, { studioId })
  return (data ?? []) as FinanzAppAccount[]
}

/**
 * Resuelve la cuenta destino: la explícita si pertenece al workspace y está
 * activa; si no, la default del studio (validada igual); si no, null.
 */
export async function resolveFinanzAppAccount(
  studioId: string,
  explicitAccountId?: string | null,
): Promise<string | null> {
  const accounts = await listFinanzAppAccounts(studioId)
  if (accounts.length === 0) return null

  if (explicitAccountId && accounts.some((a) => a.id === explicitAccountId)) {
    return explicitAccountId
  }

  const sb = untypedService()
  const { data } = await sb
    .from("studios")
    .select("default_finance_account_id")
    .eq("id", studioId)
    .maybeSingle()

  const defaultId = (data?.default_finance_account_id as string | null) ?? null
  if (defaultId && accounts.some((a) => a.id === defaultId)) return defaultId
  return null
}

/**
 * Reasigna la cuenta de FinanzApp en una transacción YA registrada por el
 * CRM (caso: pago pendiente que el usuario resuelve desde /finance).
 * Identifica la tx por external_reference = `crm-payment:<paymentId>`.
 */
export async function assignAccountToFinanzAppPayment(
  studioId: string,
  paymentId: string,
  accountId: string,
): Promise<{ ok: boolean; updated: number; skipped?: "no_workspace" }> {
  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return { ok: false, updated: 0, skipped: "no_workspace" }

  // Validar que la cuenta pertenece al workspace antes de invocar la RPC
  const accounts = await listFinanzAppAccounts(studioId)
  if (!accounts.some((a) => a.id === accountId)) {
    throw new Error("FINZ_ACCOUNT_NOT_FOUND")
  }

  const sb = untypedService()
  const { data, error } = await sb.rpc("finz_assign_account_to_tx", {
    p_workspace_id: workspaceId,
    p_external_reference: `crm-payment:${paymentId}`,
    p_cuenta_id: accountId,
  })

  if (error)
    throwServiceError("FINZ_ASSIGN_ACCOUNT_FAILED", error, { studioId, paymentId })

  return { ok: true, updated: (data as { updated: number } | null)?.updated ?? 0 }
}

/** Settea la cuenta default del studio, validando que exista en FinanzApp. */
export async function setDefaultFinanzAppAccount(
  studioId: string,
  actorId: string,
  accountId: string | null,
): Promise<void> {
  if (accountId) {
    const accounts = await listFinanzAppAccounts(studioId)
    if (!accounts.some((a) => a.id === accountId)) {
      throw new Error("FINZ_ACCOUNT_NOT_FOUND")
    }
  }

  const sb = untypedService()
  const { error } = await sb
    .from("studios")
    .update({ default_finance_account_id: accountId })
    .eq("id", studioId)

  if (error)
    throwServiceError("STUDIO_UPDATE_FAILED", error, { studioId, accountId })

  await logActivity({
    studioId,
    actorId,
    entityType: "studio",
    entityId: studioId,
    action: "studio.default_finance_account.updated",
    metadata: { account_id: accountId, target: "finanzapp" },
  })
}

export type RecordIncomeToFinanzAppInput = {
  /** UUID del row en payments — clave de idempotencia (crm-payment:<id>). */
  paymentId: string
  amount: number
  /** ISO timestamp del pago; se registra la fecha (YYYY-MM-DD). */
  paidAt?: string
  /** Cuenta elegida en el modal; si no viene/es inválida cae a la default. */
  accountId?: string | null
  /** "Pago factura INV-0001" etc. */
  description?: string
  /** Nombre del cliente → finanzapp.transactions.cliente_asociado. */
  clientName?: string | null
  /** Referencia/comprobante del pago → notas. */
  reference?: string | null
  /** Moneda de la factura; si no es DOP se anota en notas (FinanzApp es DOP). */
  currency?: string
}

export type RecordIncomeToFinanzAppResult = {
  ok: boolean
  transactionId?: string
  alreadyExisted?: boolean
  skipped?: "no_workspace"
}

/**
 * Registra el ingreso en FinanzApp. Best-effort por diseño: si el studio no
 * tiene workspace mapeado devolvemos skipped en vez de tirar, y los callers
 * lo envuelven en try/catch para no bloquear el pago.
 */
export async function recordIncomeToFinanzApp(
  studioId: string,
  actorId: string,
  input: RecordIncomeToFinanzAppInput & { preResolved?: boolean },
): Promise<RecordIncomeToFinanzAppResult> {
  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return { ok: false, skipped: "no_workspace" }

  // Si el caller ya validó la cuenta (markInvoicePaid lo hace al insert),
  // la usamos tal cual; si no, la resolvemos contra el default del studio.
  const accountId = input.preResolved
    ? input.accountId ?? null
    : await resolveFinanzAppAccount(studioId, input.accountId)

  const fecha = (input.paidAt ?? new Date().toISOString()).slice(0, 10)
  const notas =
    [
      input.reference ? `Ref: ${input.reference}` : null,
      input.currency && input.currency !== "DOP"
        ? `Moneda original: ${input.currency}`
        : null,
      "Registrado automáticamente desde el CRM",
    ]
      .filter(Boolean)
      .join(" · ") || null

  // Descripción visible en la lista de FinanzApp: incluye el nombre del
  // cliente para identificar el pago de un vistazo (sin abrir el detalle).
  const baseDesc = input.description ?? "Pago de factura (CRM)"
  const descripcion = input.clientName
    ? `${baseDesc} — ${input.clientName}`
    : baseDesc

  const sb = untypedService()
  const { data, error } = await sb.rpc("finz_record_income", {
    p_workspace_id: workspaceId,
    p_monto: input.amount,
    p_fecha: fecha,
    p_external_reference: `crm-payment:${input.paymentId}`,
    p_cuenta_id: accountId,
    p_descripcion: descripcion,
    p_cliente: input.clientName ?? null,
    p_notas: notas,
  })

  if (error)
    throwServiceError("FINZ_RECORD_INCOME_FAILED", error, {
      studioId,
      paymentId: input.paymentId,
    })

  const result = data as { transaction_id: string; already_existed: boolean }

  if (!result.already_existed) {
    await logActivity({
      studioId,
      actorId,
      entityType: "payment",
      entityId: input.paymentId,
      action: "finanzapp.income_recorded",
      metadata: {
        transaction_id: result.transaction_id,
        amount: input.amount,
        account_id: accountId,
      },
    })
  }

  return {
    ok: true,
    transactionId: result.transaction_id,
    alreadyExisted: result.already_existed,
  }
}

// ===========================================================================
// PAGOS A COLABORADORES (cuentas por pagar) — Fase 3 del módulo Colaboradores
// ---------------------------------------------------------------------------
// Deuda pendiente → finanzapp.payables (estado pendiente). Al pagarse → gasto
// en finanzapp.transactions + payable 'pagada'. Bidireccional: el CRM lee el
// estado de los payables para reflejar pagos hechos en FinanzApp.
// external_reference del payable = `crm-collab:<projectCollaboratorId>`.
// Todas best-effort: si el studio no tiene workspace mapeado → skipped.
// ===========================================================================

const collabRef = (assignmentId: string) => `crm-collab:${assignmentId}`
type FinzResult = { ok: boolean; skipped?: "no_workspace" }

/** Crea/actualiza el payable pendiente del pago acordado al colaborador. */
export async function recordCollaboratorPayable(
  studioId: string,
  input: {
    assignmentId: string
    acreedor: string
    monto: number
    /** vencimiento = fecha del servicio/sesión. */
    dueDate?: string | null
    notas?: string | null
  },
): Promise<FinzResult> {
  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return { ok: false, skipped: "no_workspace" }
  const sb = untypedService()
  const { error } = await sb.rpc("finz_record_payable", {
    p_workspace_id: workspaceId,
    p_acreedor: input.acreedor || "Colaborador",
    p_monto: input.monto,
    p_fecha_emision: new Date().toISOString().slice(0, 10),
    p_fecha_venc: input.dueDate ? input.dueDate.slice(0, 10) : null,
    p_external_reference: collabRef(input.assignmentId),
    p_notas: input.notas ?? "Pago a colaborador (CRM)",
  })
  if (error)
    throwServiceError("FINZ_RECORD_PAYABLE_FAILED", error, { studioId })
  return { ok: true }
}

/** Salda el payable: lo marca 'pagada' y registra el gasto real. */
export async function settleCollaboratorPayable(
  studioId: string,
  input: {
    assignmentId: string
    accountId?: string | null
    paidAt?: string
    descripcion?: string | null
  },
): Promise<FinzResult> {
  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return { ok: false, skipped: "no_workspace" }
  const sb = untypedService()
  const { error } = await sb.rpc("finz_settle_payable", {
    p_workspace_id: workspaceId,
    p_external_reference: collabRef(input.assignmentId),
    p_cuenta_id: input.accountId ?? null,
    p_fecha_pago: (input.paidAt ?? new Date().toISOString()).slice(0, 10),
    p_descripcion: input.descripcion ?? null,
  })
  if (error)
    throwServiceError("FINZ_SETTLE_PAYABLE_FAILED", error, { studioId })
  return { ok: true }
}

/** Cancela el payable (+ anula el gasto si existía). */
export async function cancelCollaboratorPayable(
  studioId: string,
  assignmentId: string,
): Promise<FinzResult> {
  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return { ok: false, skipped: "no_workspace" }
  const sb = untypedService()
  const { error } = await sb.rpc("finz_cancel_payable", {
    p_workspace_id: workspaceId,
    p_external_reference: collabRef(assignmentId),
  })
  if (error)
    throwServiceError("FINZ_CANCEL_PAYABLE_FAILED", error, { studioId })
  return { ok: true }
}

// ─── Vestido de la sesión (gasto en FinanzApp, como los colaboradores) ────────
const dressRef = (projectId: string) => `crm-dress:${projectId}`

/** Crea/actualiza el payable pendiente del costo del vestido de la sesión. */
export async function recordDressPayable(
  studioId: string,
  input: {
    projectId: string
    acreedor: string
    monto: number
    /** vencimiento = fecha de la sesión. */
    dueDate?: string | null
    notas?: string | null
  },
): Promise<FinzResult> {
  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return { ok: false, skipped: "no_workspace" }
  const sb = untypedService()
  const { error } = await sb.rpc("finz_record_payable", {
    p_workspace_id: workspaceId,
    p_acreedor: input.acreedor || "Vestido",
    p_monto: input.monto,
    p_fecha_emision: new Date().toISOString().slice(0, 10),
    p_fecha_venc: input.dueDate ? input.dueDate.slice(0, 10) : null,
    p_external_reference: dressRef(input.projectId),
    p_notas: input.notas ?? "Vestido de la sesión (CRM)",
  })
  if (error) throwServiceError("FINZ_RECORD_PAYABLE_FAILED", error, { studioId })
  return { ok: true }
}

/** Salda el payable del vestido: lo marca 'pagada' y registra el gasto real. */
export async function settleDressPayable(
  studioId: string,
  input: {
    projectId: string
    accountId?: string | null
    paidAt?: string
    descripcion?: string | null
  },
): Promise<FinzResult> {
  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return { ok: false, skipped: "no_workspace" }
  const sb = untypedService()
  const { error } = await sb.rpc("finz_settle_payable", {
    p_workspace_id: workspaceId,
    p_external_reference: dressRef(input.projectId),
    p_cuenta_id: input.accountId ?? null,
    p_fecha_pago: (input.paidAt ?? new Date().toISOString()).slice(0, 10),
    p_descripcion: input.descripcion ?? null,
  })
  if (error) throwServiceError("FINZ_SETTLE_PAYABLE_FAILED", error, { studioId })
  return { ok: true }
}

/** Cancela el payable del vestido (+ anula el gasto si existía). */
export async function cancelDressPayable(
  studioId: string,
  projectId: string,
): Promise<FinzResult> {
  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return { ok: false, skipped: "no_workspace" }
  const sb = untypedService()
  const { error } = await sb.rpc("finz_cancel_payable", {
    p_workspace_id: workspaceId,
    p_external_reference: dressRef(projectId),
  })
  if (error) throwServiceError("FINZ_CANCEL_PAYABLE_FAILED", error, { studioId })
  return { ok: true }
}

/** Reabre el payable (vuelve a pendiente; anula el gasto). */
export async function reopenCollaboratorPayable(
  studioId: string,
  assignmentId: string,
): Promise<FinzResult> {
  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return { ok: false, skipped: "no_workspace" }
  const sb = untypedService()
  const { error } = await sb.rpc("finz_reopen_payable", {
    p_workspace_id: workspaceId,
    p_external_reference: collabRef(assignmentId),
  })
  if (error)
    throwServiceError("FINZ_REOPEN_PAYABLE_FAILED", error, { studioId })
  return { ok: true }
}

/**
 * Estados actuales de los payables de colaboradores en FinanzApp
 * (external_reference → estado). Para la reconciliación inversa: si el usuario
 * pagó el payable en FinanzApp, el CRM lo refleja como pagado.
 */
export async function listCollaboratorPayableStatuses(
  studioId: string,
): Promise<Record<string, string>> {
  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return {}
  const sb = untypedService()
  const { data, error } = await sb.rpc("finz_list_payable_statuses", {
    p_workspace_id: workspaceId,
    p_prefix: "crm-collab:",
  })
  if (error) return {}
  const out: Record<string, string> = {}
  for (const r of (data ?? []) as Array<{
    external_reference: string
    estado: string
  }>) {
    if (r.external_reference) out[r.external_reference] = r.estado
  }
  return out
}
