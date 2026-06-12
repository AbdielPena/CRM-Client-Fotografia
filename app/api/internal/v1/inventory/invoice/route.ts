import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { untypedService } from "@/server/supabase/untyped"
import { createClient } from "@/server/services/client.service"
import { createProject } from "@/server/services/project.service"
import { createInvoice, markInvoicePaid } from "@/server/services/invoice.service"

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
 * Auth: Authorization: Bearer <DRIVE_CRON_TOKEN | TASK_REMINDERS_CRON_TOKEN>.
 * Idempotencia: si externalRef ya generó una factura, la devuelve sin duplicar.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Vacío a propósito: created_by/confirmed_by/actor_user_id son uuid NOT-this →
// `actorId || null` queda null (acción de sistema), sin romper los inserts.
const SYSTEM_ACTOR = ""
const PROJECT_NAME = "Rentas de Inventario"

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
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected = process.env.DRIVE_CRON_TOKEN || process.env.TASK_REMINDERS_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: "token no configurado" }, { status: 500 })
  if (token !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

    // 1) Cliente: por email, o por nombre+teléfono; sino crear.
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
      const created = await createClient(studioId, SYSTEM_ACTOR, {
        name: body.client.name,
        email: body.client.email ?? undefined,
        phone: body.client.phone ?? undefined,
        source: "manual",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      clientId = (created as { id: string }).id
    }

    // Guardar documento fiscal del cliente si vino.
    if (body.client.documentNumber) {
      await sb
        .from("clients")
        .update({ document_number: body.client.documentNumber })
        .eq("id", clientId)
        .eq("studio_id", studioId)
    }

    // 2) Proyecto "Rentas de Inventario" del cliente (find-or-create).
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
      const proj = await createProject(studioId, SYSTEM_ACTOR, {
        clientId,
        name: PROJECT_NAME,
        eventType: "inventario",
        currency: body.currency,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      projectId = (proj as { id: string }).id
    }

    // 3) Factura (el marcador de ref va en notes para idempotencia).
    const notes = `${body.notes ?? ""}\n${refMark}`.trim()
    const invoice = await createInvoice(studioId, SYSTEM_ACTOR, {
      projectId,
      clientId,
      currency: body.currency,
      notes,
      discount: 0,
      depositPercent: 0,
      items: body.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        taxRate: it.taxRate,
      })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const invoiceId = (invoice as { id: string }).id

    // 4) Pago (opcional) → dispara Facturación + Finanzas.
    let paid = false
    if (body.payment && body.payment.amount > 0) {
      await markInvoicePaid(studioId, SYSTEM_ACTOR, invoiceId, {
        amount: body.payment.amount,
        method: body.payment.method,
        reference: body.externalRef,
      })
      paid = true
    }

    return NextResponse.json({ invoiceId, clientId, projectId, paid })
  } catch (e) {
    console.error("[inventory/invoice] error", e)
    return NextResponse.json(
      { error: "INVENTORY_INVOICE_FAILED", message: e instanceof Error ? e.message : "error" },
      { status: 500 },
    )
  }
}
