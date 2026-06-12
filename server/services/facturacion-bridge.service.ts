import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { untypedService } from "@/server/supabase/untyped"

/**
 * Puente CRM → App de Facturación (facturacion.abbypixel.com).
 *
 * Decisión de producto: las facturas del CRM se reflejan automáticamente en
 * la app de Facturación (proyecto Supabase separado, schema estilo Prisma).
 * El CRM sigue siendo donde se CREAN las facturas; la app de Facturación las
 * recibe como espejo (cliente + factura + items + pagos).
 *
 * Idempotencia: los ids del espejo SON los ids del CRM (PK = uuid del CRM),
 * así que re-mirrors son upserts y los retries no duplican.
 *
 * NCF: el CRM asigna NCF con su propio módulo fiscal. El espejo copia el NCF
 * como texto (ncfSequenceId = null) — NUNCA consume las secuencias de la app
 * de Facturación, evitando doble asignación fiscal.
 *
 * Config (server-only, .env del VPS):
 *   FACTURACION_SUPABASE_URL, FACTURACION_SERVICE_ROLE_KEY,
 *   FACTURACION_COMPANY_ID, FACTURACION_CREATED_BY_ID
 * Si falta alguna, todo se salta silenciosamente (skipped) — el CRM nunca
 * se bloquea por el espejo. Todos los callers usan IIFE best-effort.
 */

type MirrorResult = { ok: boolean; skipped?: "not_configured" | "not_found" }

function getFacturacionClient(): {
  client: SupabaseClient | null
  companyId: string
  createdById: string
} {
  const url = process.env.FACTURACION_SUPABASE_URL
  const key = process.env.FACTURACION_SERVICE_ROLE_KEY
  const companyId = process.env.FACTURACION_COMPANY_ID ?? ""
  const createdById = process.env.FACTURACION_CREATED_BY_ID ?? ""

  if (!url || !key || !companyId || !createdById) {
    return { client: null, companyId, createdById }
  }

  return {
    client: createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    companyId,
    createdById,
  }
}

/** CRM status → InvoiceStatus de la app de Facturación. */
function mapStatus(crmStatus: string | null | undefined): string {
  switch (crmStatus) {
    case "draft":
      return "DRAFT"
    case "partially_paid":
      return "PARTIALLY_PAID"
    case "paid":
      return "PAID"
    case "overdue":
      return "OVERDUE"
    case "cancelled":
      return "CANCELLED"
    default:
      // pending / sent / viewed → factura emitida
      return "ISSUED"
  }
}

/** CRM payment method → InvoicePaymentMethod de la app de Facturación. */
function mapMethod(crmMethod: string | null | undefined): string {
  switch (crmMethod) {
    case "cash":
      return "CASH"
    case "bank_transfer":
      return "TRANSFER"
    case "check":
      return "CHECK"
    case "azul":
    case "cardnet":
    case "stripe":
      return "CARD"
    case "zelle":
    case "paypal":
      return "DIGITAL_WALLET"
    default:
      return "OTHER"
  }
}

const NCF_TYPE_RE = /^B\d{2}$/

/**
 * Espeja una factura del CRM (cliente + factura + items) en la app de
 * Facturación. Upsert completo: sirve para creación, edición, emisión de
 * NCF y cambios de estado por pagos.
 */
export async function mirrorInvoiceToFacturacion(
  studioId: string,
  invoiceId: string,
): Promise<MirrorResult> {
  const { client: fact, companyId, createdById } = getFacturacionClient()
  if (!fact) return { ok: false, skipped: "not_configured" }

  // Cargar la factura completa del CRM (service client: sin RLS, server-only)
  const crm = untypedService()
  const { data: invoice } = await crm
    .from("invoices")
    .select(
      `id, studio_id, invoice_number, status, currency, subtotal,
       discount_amount, tax_amount, total, amount_paid, notes,
       ncf, ncf_type, due_date, sent_at, created_at, deleted_at,
       client:clients(id, name, email, phone, document_number, rnc),
       items:invoice_items(id, description, quantity, unit_price, tax_rate, amount, sort_order)`,
    )
    .eq("id", invoiceId)
    .eq("studio_id", studioId)
    .maybeSingle()

  if (!invoice) return { ok: false, skipped: "not_found" }

  type Rec = Record<string, unknown>
  const inv = invoice as Rec
  const clientRaw = inv.client
  const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as Rec | null
  const items = (inv.items ?? []) as Rec[]
  const now = new Date().toISOString()

  // 1) Cliente → customers (id = uuid del CRM)
  let customerId: string | null = null
  if (client?.id) {
    customerId = String(client.id)
    const { error: custErr } = await fact.from("customers").upsert(
      {
        id: customerId,
        companyId,
        type: "INDIVIDUAL",
        legalName: String(client.name ?? "Cliente"),
        documentNumber:
          (client.document_number as string | null) ??
          (client.rnc as string | null) ??
          null,
        email: (client.email as string | null) ?? null,
        phone: (client.phone as string | null) ?? null,
        country: "DO",
        creditLimit: 0,
        balanceDue: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      { onConflict: "id", ignoreDuplicates: false },
    )
    if (custErr) {
      console.error("[facturacion-bridge] customer upsert failed:", custErr.message)
      return { ok: false }
    }
  } else {
    // La app exige customerId NOT NULL; sin cliente no podemos espejar.
    return { ok: false, skipped: "not_found" }
  }

  // 2) Factura → invoices (id = uuid del CRM)
  const total = Number(inv.total ?? 0)
  const paid = Number(inv.amount_paid ?? 0)
  const ncfType = typeof inv.ncf_type === "string" && NCF_TYPE_RE.test(inv.ncf_type)
    ? inv.ncf_type
    : null

  const { error: invErr } = await fact.from("invoices").upsert(
    {
      id: String(inv.id),
      companyId,
      customerId,
      createdById,
      number: String(inv.invoice_number ?? String(inv.id).slice(0, 8)),
      ncf: (inv.ncf as string | null) ?? null,
      ncfType,
      ncfSequenceId: null, // nunca consumir secuencias de la app externa
      status: inv.deleted_at ? "CANCELLED" : mapStatus(inv.status as string),
      paymentMethod: "CREDIT", // se cobra después; los pagos van aparte
      isCredit: true,
      issueDate: (inv.sent_at as string | null) ?? (inv.created_at as string) ?? now,
      dueDate: (inv.due_date as string | null) ?? null,
      currency: (inv.currency as string | null) ?? "DOP",
      exchangeRate: 1,
      subtotal: Number(inv.subtotal ?? 0),
      discountTotal: Number(inv.discount_amount ?? 0),
      taxTotal: Number(inv.tax_amount ?? 0),
      withholdingTotal: 0,
      tipAmount: 0,
      total,
      paidAmount: paid,
      balanceDue: Math.max(0, Math.round((total - paid) * 100) / 100),
      notes: (inv.notes as string | null) ?? null,
      inventorySyncStatus: "NOT_REQUIRED",
      createdAt: (inv.created_at as string) ?? now,
      updatedAt: now,
      deletedAt: (inv.deleted_at as string | null) ?? null,
    },
    { onConflict: "id", ignoreDuplicates: false },
  )
  if (invErr) {
    console.error("[facturacion-bridge] invoice upsert failed:", invErr.message)
    return { ok: false }
  }

  // 3) Items → invoice_items (reemplazo completo: cubre ediciones)
  const { error: delErr } = await fact
    .from("invoice_items")
    .delete()
    .eq("invoiceId", String(inv.id))
  if (delErr) {
    console.error("[facturacion-bridge] items delete failed:", delErr.message)
    return { ok: false }
  }

  if (items.length > 0) {
    const rows = items.map((it, idx) => {
      const qty = Number(it.quantity ?? 1)
      const price = Number(it.unit_price ?? 0)
      const taxRate = Number(it.tax_rate ?? 0)
      const lineBase = qty * price
      return {
        id: String(it.id),
        invoiceId: String(inv.id),
        description: String(it.description ?? ""),
        quantity: qty,
        unitPrice: price,
        discount: 0,
        taxRate,
        taxAmount: Math.round(lineBase * (taxRate / 100) * 100) / 100,
        lineTotal: Number(it.amount ?? lineBase),
        position: Number(it.sort_order ?? idx),
        // Enum InventorySyncStatus de Facturación: estos ítems vienen del CRM y
        // no se vinculan al inventario de la app de Facturación.
        externalSyncStatus: "NOT_REQUIRED",
      }
    })
    const { error: itemsErr } = await fact.from("invoice_items").insert(rows)
    if (itemsErr) {
      console.error("[facturacion-bridge] items insert failed:", itemsErr.message)
      return { ok: false }
    }
  }

  return { ok: true }
}

/**
 * Espeja un pago del CRM en invoice_payments y refresca la factura espejo
 * (paidAmount / balanceDue / status). Idempotente: id = uuid del payment.
 */
export async function mirrorPaymentToFacturacion(
  studioId: string,
  invoiceId: string,
  payment: {
    id: string
    amount: number
    method: string
    reference?: string | null
    receivedAt?: string
  },
): Promise<MirrorResult> {
  const { client: fact } = getFacturacionClient()
  if (!fact) return { ok: false, skipped: "not_configured" }

  // La factura espejo debe existir/estar al día (también actualiza estados).
  const mirrored = await mirrorInvoiceToFacturacion(studioId, invoiceId)
  if (!mirrored.ok) return mirrored

  const { error } = await fact.from("invoice_payments").upsert(
    {
      id: payment.id,
      invoiceId,
      method: mapMethod(payment.method),
      amount: payment.amount,
      reference: payment.reference ?? null,
      receivedAt: payment.receivedAt ?? new Date().toISOString(),
      notes: "Registrado automáticamente desde el CRM",
      createdAt: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true },
  )
  if (error) {
    console.error("[facturacion-bridge] payment upsert failed:", error.message)
    return { ok: false }
  }

  return { ok: true }
}
