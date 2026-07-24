import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { untypedService } from "@/server/supabase/untyped"
import { invoicesRepo } from "@/server/repositories"
import { mirrorInvoiceToFacturacion, mirrorPaymentToFacturacion } from "@/server/services/facturacion-bridge.service"
import { resolveFinanzAppAccount, recordIncomeToFinanzApp } from "@/server/services/finanzapp-bridge.service"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/inventory/invoice
 *
 * Inventario (inventario-app) llama acá cuando factura una renta. El CRM —que es
 * la FUENTE— crea la factura fiscal; los puentes existentes la espejan a la app
 * de Facturación y, si viene pago, registran el ingreso en Finanzas (FinanzApp).
 *
 * Flujo: cliente (find-or-create) → proyecto "Rentas de Inventario" del cliente
 * (find-or-create) → factura → (opcional) pago → Facturación + Finanzas.
 *
 * IMPORTANTE — sin sesión: este endpoint se autentica por token de servicio, no
 * por sesión de Supabase, así que NO puede usar los servicios createClient/
 * createInvoice/markInvoicePaid (van por RLS y dispararían efectos no deseados:
 * email de bienvenida al portal, automatizaciones, etc.). En su lugar inserta
 * con el cliente service-role (`untypedService`, omite RLS) y los repos en modo
 * `{ elevated: true }`, y llama los puentes (Facturación / FinanzApp) directo.
 * Así queda 100% aislado del camino de dinero "vivo" del CRM.
 *
 * Auth: Authorization: Bearer <DRIVE_CRON_TOKEN | TASK_REMINDERS_CRON_TOKEN>.
 * Idempotencia: si externalRef ya generó una factura, la devuelve sin duplicar.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PROJECT_NAME = "Rentas de Inventario"
const ELEVATED = { elevated: true } as const

/**
 * Normaliza el método de pago que manda Inventario (texto libre / español) a un
 * label canónico. El enum `payment_method` acepta ambos idiomas, así que el
 * insert nunca falla; esto es para que el puente de Facturación lo mapee bien
 * (CASH / TRANSFER / CHECK / CARD) en vez de caer a OTHER.
 */
function normalizeMethod(raw: string): string {
  const m = raw.trim().toLowerCase()
  if (["efectivo", "cash"].includes(m)) return "cash"
  if (["transferencia", "transfer", "bank_transfer", "deposito", "depósito"].includes(m)) return "bank_transfer"
  if (["cheque", "check"].includes(m)) return "check"
  if (["tarjeta", "card", "azul", "cardnet"].includes(m)) return "azul"
  if (m === "zelle") return "zelle"
  if (m === "paypal") return "paypal"
  return "otro"
}

/** Igual que invoice.service.calculateTotals — replicado para no tocar el servicio RLS. */
function calculateTotals(items: { quantity: number; unitPrice: number; taxRate: number }[]) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const tax = items.reduce((s, i) => s + i.quantity * i.unitPrice * ((i.taxRate ?? 0) / 100), 0)
  const total = subtotal + tax
  return { subtotal, tax, total }
}

const bodySchema = z.object({
  studioId: z.string().uuid(),
  externalRef: z.string().min(1).max(120),
  client: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
    documentNumber: z.string().max(40).optional().nullable(),
  }),
  items: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        quantity: z.coerce.number().min(0.01),
        unitPrice: z.coerce.number().min(0),
        taxRate: z.coerce.number().min(0).max(100).default(0),
      }),
    )
    .min(1),
  currency: z.string().length(3).default("DOP"),
  notes: z.string().max(2000).optional(),
  payment: z
    .object({ amount: z.coerce.number().min(0), method: z.string().max(40).default("efectivo") })
    .optional(),
})

export async function POST(req: NextRequest) {
  // Mismo guardia que el resto de /api/internal: INTERNAL_API_KEY comparada en
  // tiempo constante. Antes exigía DRIVE_CRON_TOKEN/TASK_REMINDERS_CRON_TOKEN,
  // que NO existen en producción → este puente Inventario→Factura llevaba
  // tiempo devolviendo 500. Se acepta `x-internal-key` o `Bearer` (el llamador
  // de Inventario usa Bearer, así que sigue funcionando).
  const expected = process.env.INTERNAL_API_KEY ?? null
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_API_KEY no configurada" }, { status: 500 })
  }
  const provided =
    req.headers.get("x-internal-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: "payload inválido", detail: e instanceof Error ? e.message : "" },
      { status: 400 },
    )
  }

  const sb = untypedService()
  const { studioId } = body

  try {
    // 0) Idempotencia por externalRef (guardado en invoices.notes como marcador).
    const refMark = `[inv-ref:${body.externalRef}]`
    const { data: existingInv } = await sb
      .from("invoices")
      .select("id")
      .eq("studio_id", studioId)
      .ilike("notes", `%${refMark}%`)
      .is("deleted_at", null)
      .maybeSingle()
    if (existingInv) {
      return NextResponse.json({ invoiceId: (existingInv as { id: string }).id, reused: true })
    }

    // 1) Cliente: por email, o por teléfono; sino crear (insert directo, sin RLS
    //    ni efectos secundarios — nada de email de bienvenida para una renta).
    let clientId: string | null = null
    if (body.client.email) {
      const { data } = await sb
        .from("clients")
        .select("id")
        .eq("studio_id", studioId)
        .eq("email", body.client.email)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle()
      clientId = (data as { id: string } | null)?.id ?? null
    }
    if (!clientId && body.client.phone) {
      const digits = body.client.phone.replace(/\D/g, "").slice(-10)
      if (digits) {
        const { data } = await sb
          .from("clients")
          .select("id")
          .eq("studio_id", studioId)
          .ilike("phone", `%${digits}%`)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle()
        clientId = (data as { id: string } | null)?.id ?? null
      }
    }
    if (!clientId) {
      const { data: created, error: cErr } = await sb
        .from("clients")
        .insert({
          studio_id: studioId,
          name: body.client.name,
          email: body.client.email ?? null,
          phone: body.client.phone ?? null,
          source: "manual",
          document_number: body.client.documentNumber ?? null,
        })
        .select("id")
        .single()
      if (cErr) throw new Error(`[clients.insert] ${cErr.message}`)
      clientId = (created as { id: string }).id
    } else if (body.client.documentNumber) {
      // Cliente existente sin documento → completarlo si vino (RNC se agrega luego).
      await sb
        .from("clients")
        .update({ document_number: body.client.documentNumber })
        .eq("id", clientId)
        .eq("studio_id", studioId)
        .is("document_number", null)
    }

    // 2) Proyecto "Rentas de Inventario" del cliente (find-or-create, sin RLS).
    const { data: existingProj } = await sb
      .from("projects")
      .select("id")
      .eq("studio_id", studioId)
      .eq("client_id", clientId)
      .eq("name", PROJECT_NAME)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle()
    let projectId = (existingProj as { id: string } | null)?.id ?? null
    if (!projectId) {
      const { data: proj, error: pErr } = await sb
        .from("projects")
        .insert({
          studio_id: studioId,
          client_id: clientId,
          name: PROJECT_NAME,
          event_type: "other",
          currency: body.currency.toUpperCase(),
        })
        .select("id")
        .single()
      if (pErr) throw new Error(`[projects.insert] ${pErr.message}`)
      projectId = (proj as { id: string }).id
    }

    // 3) Factura (vía repos elevados: omiten RLS sin tocar el servicio createInvoice).
    const currency = body.currency.toUpperCase()
    const invoiceNumber = await invoicesRepo.nextInvoiceNumber(studioId, undefined, ELEVATED)
    const sequenceNumber = parseInt(
      invoiceNumber.replace(/^.*-/, "").replace(/^0+/, "") || "0",
      10,
    )
    const lines = body.items.map((it) => ({
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      taxRate: it.taxRate,
    }))
    const { subtotal, tax, total } = calculateTotals(lines)
    const notes = `${body.notes ?? ""}\n${refMark}`.trim()

    const invoice = await invoicesRepo.create(
      {
        studio_id: studioId,
        project_id: projectId,
        client_id: clientId,
        invoice_number: invoiceNumber,
        sequence_number: sequenceNumber,
        kind: "full",
        subtotal,
        tax_rate: 0,
        tax_amount: tax,
        discount_amount: 0,
        total,
        amount_paid: 0,
        currency,
        status: "draft",
        notes,
        created_by: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      ELEVATED,
    )
    const invoiceId = (invoice as { id: string }).id

    // Items con tax_rate por línea (columna existe) → Facturación los espeja exactos.
    const itemRows = body.items.map((it, idx) => ({
      invoice_id: invoiceId,
      studio_id: studioId,
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      tax_rate: it.taxRate,
      // `amount` es columna GENERADA (quantity * unit_price) — no se inserta.
      sort_order: idx,
    }))
    const { error: itErr } = await sb.from("invoice_items").insert(itemRows)
    if (itErr) throw new Error(`[invoice_items.insert] ${itErr.message}`)

    // 4) Pago (opcional). Insert directo → el trigger apply_payment_to_invoice
    //    actualiza amount_paid/status. Luego: espejo a Facturación + ingreso en
    //    Finanzas (FinanzApp). Sin pago: al menos espeja la factura.
    let paid = false
    if (body.payment && body.payment.amount > 0) {
      const method = normalizeMethod(body.payment.method)
      const nowIso = new Date().toISOString()
      const resolvedAccountId = await resolveFinanzAppAccount(studioId).catch(() => null)

      const { data: payRow, error: payErr } = await sb
        .from("payments")
        .insert({
          studio_id: studioId,
          invoice_id: invoiceId,
          project_id: projectId,
          client_id: clientId,
          amount: body.payment.amount,
          currency,
          method,
          status: "completed",
          transaction_reference: body.externalRef,
          received_at: nowIso,
          confirmed_at: nowIso,
          confirmed_by: null,
          finanzapp_account_id: resolvedAccountId,
        })
        .select("id")
        .single()
      if (payErr) throw new Error(`[payments.insert] ${payErr.message}`)
      const paymentId = (payRow as { id: string }).id
      paid = true

      // Facturación: espeja el pago (re-espeja la factura con amount_paid/status nuevos).
      await mirrorPaymentToFacturacion(studioId, invoiceId, {
        id: paymentId,
        amount: body.payment.amount,
        method,
        reference: body.externalRef,
        receivedAt: nowIso,
      })

      // Finanzas: registra el ingreso de la renta (idempotente por crm-payment:<id>).
      await recordIncomeToFinanzApp(studioId, "", {
        paymentId,
        amount: body.payment.amount,
        paidAt: nowIso,
        accountId: resolvedAccountId,
        preResolved: true,
        description: `Renta de inventario · ${invoiceNumber}`,
        clientName: body.client.name,
        reference: body.externalRef,
        currency,
      })
    } else {
      await mirrorInvoiceToFacturacion(studioId, invoiceId)
    }

    return NextResponse.json({ invoiceId, invoiceNumber, clientId, projectId, total, paid })
  } catch (e) {
    console.error("[inventory/invoice] error", e)
    return NextResponse.json(
      { error: "INVENTORY_INVOICE_FAILED", message: e instanceof Error ? e.message : "error" },
      { status: 500 },
    )
  }
}
