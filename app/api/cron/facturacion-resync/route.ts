import { NextResponse, type NextRequest } from "next/server"

import { untypedService } from "@/server/supabase/untyped"
import {
  mirrorInvoiceToFacturacion,
  mirrorPaymentToFacturacion,
} from "@/server/services/facturacion-bridge.service"

/**
 * Re-espeja TODAS las facturas (y sus pagos) del CRM a la app de Facturación.
 * Backfill / reparación: útil tras corregir el bridge o si Facturación estuvo caída.
 * Idempotente (los upserts del bridge usan el uuid del CRM como id).
 *
 * Auth: Authorization: Bearer <DRIVE_CRON_TOKEN | TASK_REMINDERS_CRON_TOKEN>.
 */
export const runtime = "nodejs"
export const maxDuration = 300
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected = process.env.DRIVE_CRON_TOKEN || process.env.TASK_REMINDERS_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: "token no configurado" }, { status: 500 })
  if (token !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sb = untypedService()

  const url = new URL(req.url)
  const onlyInvoice = url.searchParams.get("invoice") // opcional: una sola factura

  // 1) Facturas
  let invQuery = sb
    .from("invoices")
    .select("id, studio_id")
    .is("deleted_at", null)
  if (onlyInvoice) invQuery = invQuery.eq("id", onlyInvoice)
  const { data: invoices } = await invQuery
  const invRows = (invoices ?? []) as Array<{ id: string; studio_id: string }>

  let invoicesOk = 0
  const invoiceErrors: string[] = []
  for (const inv of invRows) {
    try {
      const r = await mirrorInvoiceToFacturacion(inv.studio_id, inv.id)
      if (r.ok) invoicesOk++
      else invoiceErrors.push(`${inv.id}: ${r.skipped ?? "fail"}`)
    } catch (e) {
      invoiceErrors.push(`${inv.id}: ${e instanceof Error ? e.message : "err"}`)
    }
  }

  // 2) Pagos (cada uno re-espeja su factura y luego el pago)
  const invIds = invRows.map((i) => i.id)
  let paymentsOk = 0
  const paymentErrors: string[] = []
  if (invIds.length > 0) {
    const { data: payments } = await sb
      .from("payments")
      .select("id, invoice_id, studio_id, amount, method, status, created_at")
      .in("invoice_id", invIds)
    const payRows = (payments ?? []) as Array<{
      id: string
      invoice_id: string
      studio_id: string
      amount: number
      method: string | null
      status: string | null
      created_at: string | null
    }>
    for (const p of payRows) {
      if (p.status && p.status !== "completed" && p.status !== "succeeded") continue
      try {
        const r = await mirrorPaymentToFacturacion(p.studio_id, p.invoice_id, {
          id: p.id,
          amount: Number(p.amount ?? 0),
          method: p.method ?? "cash",
          reference: null,
          receivedAt: p.created_at ?? undefined,
        })
        if (r.ok) paymentsOk++
        else paymentErrors.push(`${p.id}: ${r.skipped ?? "fail"}`)
      } catch (e) {
        paymentErrors.push(`${p.id}: ${e instanceof Error ? e.message : "err"}`)
      }
    }
  }

  return NextResponse.json({
    invoices: { total: invRows.length, ok: invoicesOk, errors: invoiceErrors.slice(0, 20) },
    payments: { ok: paymentsOk, errors: paymentErrors.slice(0, 20) },
  })
}
