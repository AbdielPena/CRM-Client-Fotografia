import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { d, format as fmtMoney } from "@/lib/decimal"
import type {
  CreateFinTransactionInput,
  UpdateFinTransactionInput,
  RecordIncomeFromInvoiceInput,
} from "@/lib/validations/fin-transaction.schema"

/**
 * Service del módulo Finance — transactions (el corazón del módulo).
 *
 * Diseño:
 *   - studioId como param explícito + .eq('studio_id', studioId)
 *   - Soft delete via `deleted_at`
 *   - Activity log unificado
 *   - decimal.js para todo cálculo monetario
 *
 * Idempotencia (caso recordIncomeFromInvoice):
 *   - external_reference UNIQUE garantiza que retries del webhook NO duplican
 *   - Si la INSERT falla con 23505 (unique violation) → devolvemos el existing
 *     row en lugar de error, así Stripe no reintenta indefinidamente
 *
 * Atomicidad transferencia:
 *   - 1 row en fin_transactions con cuenta_id (origen) + cuenta_destino_id
 *   - El compute_account_balance ya sabe leerla correctamente
 *   - No necesita stored function porque es 1 sola INSERT
 */

// ============================================================================
// Tipos
// ============================================================================

export type FinTransactionRow = {
  id: string
  studio_id: string
  tipo: "ingreso" | "gasto" | "transferencia"
  monto: number | string
  currency: string
  descripcion: string | null
  fecha: string
  categoria_id: string | null
  cuenta_id: string | null
  cuenta_destino_id: string | null
  tarjeta_id: string | null
  tipo_ingreso: string | null
  invoice_id: string | null
  client_id: string | null
  external_reference: string | null
  aplica_diezmo: boolean
  estado: "activo" | "hold" | "anulado"
  is_business: boolean
  notas: string | null
  beneficiarios: unknown
  metadata: unknown
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// ============================================================================
// Listado + detalle
// ============================================================================

export async function getFinTransactions(
  studioId: string,
  opts: {
    tipo?: "ingreso" | "gasto" | "transferencia"
    cuentaId?: string
    tarjetaId?: string
    categoriaId?: string
    fromDate?: string
    toDate?: string
    isBusiness?: boolean
    estado?: "activo" | "hold" | "anulado"
    search?: string
    page?: number
    pageSize?: number
  } = {},
) {
  const { page = 1, pageSize = 50 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("fin_transactions")
    .select(
      `*,
       categoria:fin_categories(id, nombre, emoji, color),
       cuenta:fin_accounts!cuenta_id(id, nombre),
       cuenta_destino:fin_accounts!cuenta_destino_id(id, nombre),
       tarjeta:fin_cards(id, nombre),
       invoice:invoices(id, invoice_number, ncf),
       client:clients(id, name)`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to)

  if (opts.tipo) query = query.eq("tipo", opts.tipo)
  if (opts.cuentaId) query = query.eq("cuenta_id", opts.cuentaId)
  if (opts.tarjetaId) query = query.eq("tarjeta_id", opts.tarjetaId)
  if (opts.categoriaId) query = query.eq("categoria_id", opts.categoriaId)
  if (opts.estado) query = query.eq("estado", opts.estado)
  if (opts.fromDate) query = query.gte("fecha", opts.fromDate)
  if (opts.toDate) query = query.lte("fecha", opts.toDate)
  if (typeof opts.isBusiness === "boolean")
    query = query.eq("is_business", opts.isBusiness)
  if (opts.search && opts.search.trim()) {
    const term = `%${opts.search.trim()}%`
    query = query.or(`descripcion.ilike.${term},notas.ilike.${term}`)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("FIN_TX_OP_FAILED", error)

  return {
    items: (data ?? []) as FinTransactionRow[],
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function getFinTransactionById(studioId: string, txId: string) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("fin_transactions")
    .select(
      `*,
       categoria:fin_categories(id, nombre, emoji, color, tipo),
       cuenta:fin_accounts!cuenta_id(id, nombre, banco:fin_banks(id, nombre)),
       cuenta_destino:fin_accounts!cuenta_destino_id(id, nombre),
       tarjeta:fin_cards(id, nombre),
       invoice:invoices(id, invoice_number, ncf, total),
       client:clients(id, name, email)`,
    )
    .eq("id", txId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) throwServiceError("FIN_TX_OP_FAILED", error)
  return data as FinTransactionRow | null
}

// ============================================================================
// Crear
// ============================================================================

export async function createFinTransaction(
  studioId: string,
  actorId: string,
  data: CreateFinTransactionInput,
) {
  const sb = untypedService()

  const payload = {
    studio_id: studioId,
    tipo: data.tipo,
    monto: d(data.monto).toFixed(2),
    currency: data.currency ?? "DOP",
    descripcion: data.descripcion ?? null,
    fecha: data.fecha,
    categoria_id: data.categoriaId ?? null,
    cuenta_id: data.cuentaId ?? null,
    cuenta_destino_id: data.cuentaDestinoId ?? null,
    tarjeta_id: data.tarjetaId ?? null,
    tipo_ingreso: data.tipoIngreso ?? null,
    invoice_id: data.invoiceId ?? null,
    client_id: data.clientId ?? null,
    external_reference: data.externalReference ?? null,
    aplica_diezmo: data.aplicaDiezmo ?? false,
    is_business: data.isBusiness ?? true,
    notas: data.notas ?? null,
    beneficiarios: data.beneficiarios ?? null,
    estado: "activo",
  }

  const { data: row, error } = await sb
    .from("fin_transactions")
    .insert(payload)
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505" && error.message?.includes("external_reference")) {
      throw new Error("FIN_TX_DUPLICATE_EXTERNAL_REFERENCE")
    }
    throwServiceError("FIN_TX_CREATE_FAILED", error, { studioId })
  }

  const tx = row as FinTransactionRow
  await logActivity({
    studioId,
    actorId,
    entityType: "fin_transaction",
    entityId: tx.id,
    action: "fin_transaction.created",
    metadata: {
      tipo: tx.tipo,
      monto: tx.monto,
      currency: tx.currency,
      invoice_id: tx.invoice_id,
    },
  })

  return tx
}

// ============================================================================
// Update / Soft delete
// ============================================================================

export async function updateFinTransaction(
  studioId: string,
  actorId: string,
  txId: string,
  data: UpdateFinTransactionInput,
) {
  const sb = untypedService()
  const patch: Record<string, unknown> = {}
  if (data.monto !== undefined) patch.monto = d(data.monto).toFixed(2)
  if (data.descripcion !== undefined) patch.descripcion = data.descripcion
  if (data.fecha !== undefined) patch.fecha = data.fecha
  if (data.categoriaId !== undefined) patch.categoria_id = data.categoriaId
  if (data.notas !== undefined) patch.notas = data.notas
  if (data.estado !== undefined) patch.estado = data.estado
  if (data.isBusiness !== undefined) patch.is_business = data.isBusiness
  if (data.aplicaDiezmo !== undefined) patch.aplica_diezmo = data.aplicaDiezmo

  const { data: row, error } = await sb
    .from("fin_transactions")
    .update(patch)
    .eq("id", txId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .select("*")
    .single()

  if (error) throwServiceError("FIN_TX_UPDATE_FAILED", error, { studioId, txId })

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_transaction",
    entityId: txId,
    action: "fin_transaction.updated",
    metadata: data as Record<string, unknown>,
  })

  return row as FinTransactionRow
}

export async function deleteFinTransaction(
  studioId: string,
  actorId: string,
  txId: string,
  reason?: string | null,
) {
  const sb = untypedService()
  const { error } = await sb
    .from("fin_transactions")
    .update({ deleted_at: new Date().toISOString(), estado: "anulado" })
    .eq("id", txId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)

  if (error) throwServiceError("FIN_TX_DELETE_FAILED", error, { studioId, txId })

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_transaction",
    entityId: txId,
    action: "fin_transaction.deleted",
    metadata: reason ? { reason } : undefined,
  })
}

// ============================================================================
// recordIncomeFromInvoice — el flujo crítico cross-módulo (F4 → F5 wire-up)
// ============================================================================

export type RecordIncomeResult =
  | { ok: true; transactionId: string; alreadyExisted: false }
  | { ok: true; transactionId: string; alreadyExisted: true }

/**
 * Cuando una invoice se paga (Stripe webhook o action manual), creamos un
 * fin_transactions de tipo='ingreso' idempotente.
 *
 * Idempotencia:
 *   - external_reference = `invoice:<invoiceId>` (UNIQUE en el schema)
 *   - Si ya existe → devolvemos el row existing con alreadyExisted=true
 *   - El webhook de Stripe puede reenviarse N veces sin duplicar el income
 *
 * Categorización automática:
 *   - Si el studio tiene una fin_categories `tipo='ingreso'` con nombre
 *     "Servicios Fotográficos" o similar, la usa. Sino, queda categoria_id=null
 *     y el user puede categorizar después desde la UI.
 *
 * cuenta_id:
 *   - Por ahora null (no auto-asignamos cuenta). El user puede editar después
 *     vía updateFinTransaction. En el futuro, settings.default_account_id
 *     resolvería esto automáticamente.
 */
export async function recordIncomeFromInvoice(
  studioId: string,
  actorId: string,
  data: RecordIncomeFromInvoiceInput,
): Promise<RecordIncomeResult> {
  const sb = untypedService()
  const externalRef = `invoice:${data.invoiceId}`

  // 1. Check si ya existe (idempotencia rápida)
  const { data: existing } = await sb
    .from("fin_transactions")
    .select("id")
    .eq("studio_id", studioId)
    .eq("external_reference", externalRef)
    .is("deleted_at", null)
    .maybeSingle()

  if (existing) {
    return { ok: true, transactionId: existing.id as string, alreadyExisted: true }
  }

  // 2. Resolver fecha
  const fecha = data.paidAt
    ? data.paidAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  // 3. Buscar categoría "ingreso" default (heurística — futuro: studio settings)
  const { data: defaultCat } = await sb
    .from("fin_categories")
    .select("id")
    .eq("studio_id", studioId)
    .eq("tipo", "ingreso")
    .eq("is_business", true)
    .is("deleted_at", null)
    .order("es_sistema", { ascending: false }) // prefiere sistema-creadas
    .limit(1)
    .maybeSingle()

  // 4. Insert con external_reference. Si race condition → UNIQUE catches.
  const payload = {
    studio_id: studioId,
    tipo: "ingreso",
    monto: d(data.amount).toFixed(2),
    currency: data.currency ?? "DOP",
    descripcion: `Pago factura ${data.invoiceId.slice(0, 8)}`,
    fecha,
    categoria_id: defaultCat?.id ?? null,
    invoice_id: data.invoiceId,
    client_id: data.clientId ?? null,
    external_reference: externalRef,
    tipo_ingreso: "cliente",
    is_business: true,
    estado: "activo",
    metadata: data.paymentReference
      ? { payment_reference: data.paymentReference }
      : null,
  }

  const { data: row, error } = await sb
    .from("fin_transactions")
    .insert(payload)
    .select("id")
    .single()

  if (error) {
    // Race condition: alguien insertó entre el check y el insert. UNIQUE catches.
    if (error.code === "23505") {
      const { data: raced } = await sb
        .from("fin_transactions")
        .select("id")
        .eq("studio_id", studioId)
        .eq("external_reference", externalRef)
        .is("deleted_at", null)
        .maybeSingle()
      if (raced) {
        return { ok: true, transactionId: raced.id as string, alreadyExisted: true }
      }
    }
    throwServiceError("FIN_TX_RECORD_INCOME_FAILED", error, {
      studioId,
      invoiceId: data.invoiceId,
    })
  }

  const txId = (row as { id: string }).id
  await logActivity({
    studioId,
    actorId,
    entityType: "fin_transaction",
    entityId: txId,
    action: "fin_transaction.income_from_invoice",
    metadata: {
      invoice_id: data.invoiceId,
      amount: fmtMoney(data.amount),
      currency: data.currency,
    },
  })

  return { ok: true, transactionId: txId, alreadyExisted: false }
}

/**
 * Helper: dado un account, devuelve su balance actual usando la RPC
 * fin_compute_account_balance. Útil desde dashboards.
 */
export async function getAccountBalance(
  studioId: string,
  accountId: string,
  asOf?: string,
): Promise<number> {
  const sb = untypedServer()
  const { data, error } = await sb.rpc("fin_compute_account_balance", {
    p_studio_id: studioId,
    p_account_id: accountId,
    p_as_of: asOf ?? null,
  })

  if (error) throwServiceError("FIN_BALANCE_OP_FAILED", error)
  return Number(data ?? 0)
}
