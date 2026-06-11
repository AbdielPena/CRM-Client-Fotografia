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
  input: RecordIncomeToFinanzAppInput,
): Promise<RecordIncomeToFinanzAppResult> {
  const workspaceId = await getFinanzAppWorkspaceId(studioId)
  if (!workspaceId) return { ok: false, skipped: "no_workspace" }

  const accountId = await resolveFinanzAppAccount(studioId, input.accountId)

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

  const sb = untypedService()
  const { data, error } = await sb.rpc("finz_record_income", {
    p_workspace_id: workspaceId,
    p_monto: input.amount,
    p_fecha: fecha,
    p_external_reference: `crm-payment:${input.paymentId}`,
    p_cuenta_id: accountId,
    p_descripcion: input.description ?? "Pago de factura (CRM)",
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
