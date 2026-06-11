import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { d } from "@/lib/decimal"
import type {
  CreateFinAccountInput,
  UpdateFinAccountInput,
  CreateFinBankInput,
} from "@/lib/validations/fin-account.schema"

/**
 * Service de cuentas bancarias y bancos del módulo Finance.
 *
 * Diseño:
 *   - studioId explícito + .eq('studio_id', studioId)
 *   - Soft delete (`deleted_at`)
 *   - getAccountWithBalance llama RPC `fin_compute_account_balance` (point-in-time
 *     saldo_inicial + Σ(ingresos) - Σ(gastos) ± transferencias)
 *   - Bancos primero: al crear una cuenta hay que tener un banco. UI debería
 *     ofrecer "Crear banco rápido" inline si la lista está vacía.
 */

// ============================================================================
// Tipos
// ============================================================================

export type FinBankRow = {
  id: string
  studio_id: string
  nombre: string
  color: string | null
  icono: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type FinAccountRow = {
  id: string
  studio_id: string
  banco_id: string
  nombre: string
  tipo: string | null
  saldo_inicial: number | string
  currency: string
  activa: boolean
  metadata: unknown
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type FinAccountWithBalance = FinAccountRow & {
  banco?: { id: string; nombre: string; color: string | null; icono: string | null } | null
  balance: number
}

// ============================================================================
// Bancos
// ============================================================================

export async function getFinBanks(studioId: string) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("fin_banks")
    .select("*")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("nombre", { ascending: true })

  if (error) throwServiceError("FIN_BANK_OP_FAILED", error)
  return (data ?? []) as FinBankRow[]
}

export async function createFinBank(
  studioId: string,
  actorId: string,
  data: CreateFinBankInput,
) {
  const sb = untypedService()
  const { data: row, error } = await sb
    .from("fin_banks")
    .insert({
      studio_id: studioId,
      nombre: data.nombre,
      color: data.color ?? null,
      icono: data.icono ?? null,
      is_active: true,
    })
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") throw new Error("FIN_BANK_DUPLICATE_NAME")
    throwServiceError("FIN_BANK_CREATE_FAILED", error, { studioId })
  }

  const bank = row as FinBankRow
  await logActivity({
    studioId,
    actorId,
    entityType: "fin_bank",
    entityId: bank.id,
    action: "fin_bank.created",
    metadata: { nombre: bank.nombre },
  })

  return bank
}

// ============================================================================
// Cuentas — listado + balance
// ============================================================================

/**
 * Lista cuentas con su balance computado en paralelo.
 *
 * NOTA: si hay >50 cuentas, esto hace 50 RPC calls. Aceptable para los
 * volúmenes esperados de un studio (~5-15 cuentas). Para >100 considerar
 * una vista materializada `fin_account_balances_view` refrescada por cron.
 */
export async function getFinAccountsWithBalances(
  studioId: string,
  opts: { activaOnly?: boolean } = { activaOnly: true },
): Promise<FinAccountWithBalance[]> {
  const sb = untypedServer()
  let query = sb
    .from("fin_accounts")
    .select(
      `*,
       banco:fin_banks(id, nombre, color, icono)`,
    )
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("nombre", { ascending: true })

  if (opts.activaOnly !== false) query = query.eq("activa", true)

  const { data, error } = await query
  if (error) throwServiceError("FIN_ACCOUNT_OP_FAILED", error)

  const accounts = (data ?? []) as Array<
    FinAccountRow & {
      banco?: { id: string; nombre: string; color: string | null; icono: string | null } | null
    }
  >

  // Compute balance en paralelo (Promise.all). Cada call ~5-15ms.
  const balances = await Promise.all(
    accounts.map(async (a) => {
      try {
        const { data: balance } = await sb.rpc("fin_compute_account_balance", {
          p_studio_id: studioId,
          p_account_id: a.id,
          p_as_of: null,
        })
        return Number(balance ?? 0)
      } catch (err) {
        console.error("[fin-account] balance compute failed:", a.id, err)
        return Number(a.saldo_inicial ?? 0) // fallback al saldo inicial
      }
    }),
  )

  return accounts.map((a, i) => ({ ...a, balance: balances[i] ?? 0 }))
}

export async function getFinAccountById(studioId: string, accountId: string) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("fin_accounts")
    .select(
      `*,
       banco:fin_banks(id, nombre, color, icono)`,
    )
    .eq("id", accountId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) throwServiceError("FIN_ACCOUNT_OP_FAILED", error)
  if (!data) return null

  // Compute balance
  const { data: balance } = await sb.rpc("fin_compute_account_balance", {
    p_studio_id: studioId,
    p_account_id: accountId,
    p_as_of: null,
  })

  return {
    ...(data as FinAccountRow & {
      banco?: { id: string; nombre: string; color: string | null; icono: string | null } | null
    }),
    balance: Number(balance ?? 0),
  } as FinAccountWithBalance
}

// ============================================================================
// CRUD cuentas
// ============================================================================

export async function createFinAccount(
  studioId: string,
  actorId: string,
  data: CreateFinAccountInput,
) {
  const sb = untypedService()

  // Validar que el banco pertenezca al studio (RLS lo refuerza pero queremos 404 limpio)
  const { data: bank } = await sb
    .from("fin_banks")
    .select("id, studio_id")
    .eq("id", data.bancoId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (!bank) throw new Error("FIN_BANK_NOT_FOUND")

  const { data: row, error } = await sb
    .from("fin_accounts")
    .insert({
      studio_id: studioId,
      banco_id: data.bancoId,
      nombre: data.nombre,
      tipo: data.tipo ?? null,
      saldo_inicial: d(data.saldoInicial ?? 0).toFixed(2),
      currency: data.currency ?? "DOP",
      activa: data.activa ?? true,
    })
    .select("*")
    .single()

  if (error) throwServiceError("FIN_ACCOUNT_CREATE_FAILED", error, { studioId })

  const account = row as FinAccountRow
  await logActivity({
    studioId,
    actorId,
    entityType: "fin_account",
    entityId: account.id,
    action: "fin_account.created",
    metadata: {
      nombre: account.nombre,
      saldo_inicial: account.saldo_inicial,
      currency: account.currency,
    },
  })

  return account
}

export async function updateFinAccount(
  studioId: string,
  actorId: string,
  accountId: string,
  data: UpdateFinAccountInput,
) {
  const sb = untypedService()
  const patch: Record<string, unknown> = {}
  if (data.nombre !== undefined) patch.nombre = data.nombre
  if (data.bancoId !== undefined) patch.banco_id = data.bancoId
  if (data.tipo !== undefined) patch.tipo = data.tipo
  if (data.saldoInicial !== undefined)
    patch.saldo_inicial = d(data.saldoInicial).toFixed(2)
  if (data.currency !== undefined) patch.currency = data.currency
  if (data.activa !== undefined) patch.activa = data.activa

  const { data: row, error } = await sb
    .from("fin_accounts")
    .update(patch)
    .eq("id", accountId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .select("*")
    .single()

  if (error)
    throwServiceError("FIN_ACCOUNT_UPDATE_FAILED", error, { studioId, accountId })

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_account",
    entityId: accountId,
    action: "fin_account.updated",
    metadata: data as Record<string, unknown>,
  })

  return row as FinAccountRow
}

// ============================================================================
// Default account resolver — para wire-up CRM → Finanzas
// ============================================================================

/**
 * Resuelve qué cuenta de Finanzas recibe un pago entrante.
 *
 *   - Si `explicitAccountId` viene → valida que sea del studio y esté activa,
 *     y la devuelve. Si la validación falla (cuenta inactiva, ajena, borrada)
 *     devolvemos null en lugar de tirar — un pago no debe fallar por un mal
 *     selector; queda sin asignar y se categoriza después.
 *   - Si no viene → lee `studios.default_finance_account_id`.
 *   - Si no hay default tampoco → null. El fin_transactions queda sin cuenta.
 *
 * Lo usan: markInvoicePaid (pasa el accountId del modal) y el webhook de
 * Stripe (siempre sin explicit → usa el default del studio).
 */
export async function resolveDestinationAccount(
  studioId: string,
  explicitAccountId?: string | null,
): Promise<string | null> {
  const sb = untypedServer()

  if (explicitAccountId) {
    const { data } = await sb
      .from("fin_accounts")
      .select("id")
      .eq("id", explicitAccountId)
      .eq("studio_id", studioId)
      .eq("activa", true)
      .is("deleted_at", null)
      .maybeSingle()
    if (data) return (data as { id: string }).id
    // explicit inválido → caer al default
  }

  const { data: studio } = await sb
    .from("studios")
    .select("default_finance_account_id")
    .eq("id", studioId)
    .maybeSingle()

  const defaultId = (studio as { default_finance_account_id: string | null } | null)
    ?.default_finance_account_id
  if (!defaultId) return null

  // Validar que la default todavía exista y esté activa
  const { data: defaultAccount } = await sb
    .from("fin_accounts")
    .select("id")
    .eq("id", defaultId)
    .eq("studio_id", studioId)
    .eq("activa", true)
    .is("deleted_at", null)
    .maybeSingle()

  return defaultAccount ? (defaultAccount as { id: string }).id : null
}

/**
 * Actualiza la cuenta default del studio. La cuenta debe pertenecer al
 * studio y estar activa; si no, tira error.
 */
export async function setDefaultFinanceAccount(
  studioId: string,
  actorId: string,
  accountId: string | null,
): Promise<void> {
  const sb = untypedService()

  if (accountId) {
    const { data } = await sb
      .from("fin_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("studio_id", studioId)
      .eq("activa", true)
      .is("deleted_at", null)
      .maybeSingle()
    if (!data) throw new Error("FIN_ACCOUNT_NOT_FOUND")
  }

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
    metadata: { account_id: accountId },
  })
}

/**
 * Soft delete. Blockea si la cuenta tiene transactions activas (consistencia
 * con el balance — no queremos transactions huérfanas).
 */
export async function deleteFinAccount(
  studioId: string,
  actorId: string,
  accountId: string,
  reason?: string | null,
) {
  const sb = untypedService()

  const { count: txCount } = await sb
    .from("fin_transactions")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .eq("cuenta_id", accountId)
    .eq("estado", "activo")
    .is("deleted_at", null)

  if ((txCount ?? 0) > 0) {
    throw new Error("FIN_ACCOUNT_HAS_TRANSACTIONS")
  }

  const { error } = await sb
    .from("fin_accounts")
    .update({ deleted_at: new Date().toISOString(), activa: false })
    .eq("id", accountId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)

  if (error)
    throwServiceError("FIN_ACCOUNT_DELETE_FAILED", error, { studioId, accountId })

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_account",
    entityId: accountId,
    action: "fin_account.deleted",
    metadata: reason ? { reason } : undefined,
  })
}
