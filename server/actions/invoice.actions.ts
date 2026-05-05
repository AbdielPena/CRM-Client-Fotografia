"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createInvoice,
  sendInvoice,
  markInvoicePaid,
  deleteInvoice,
} from "@/server/services/invoice.service"
import { createInvoiceSchema } from "@/lib/validations/invoice.schema"
import { onPaymentRecorded } from "@/server/services/project-automation.service"

export async function createInvoiceAction(formData: FormData) {
  const session = await requireStudioAuth()

  // Parse line items from repeated fields
  const descriptions = formData.getAll("item_description") as string[]
  const quantities = formData.getAll("item_quantity") as string[]
  const unitPrices = formData.getAll("item_unitPrice") as string[]
  const taxRates = formData.getAll("item_taxRate") as string[]

  const items = descriptions.map((desc, i) => ({
    description: desc,
    quantity: Number(quantities[i] ?? 1),
    unitPrice: Number(unitPrices[i] ?? 0),
    taxRate: Number(taxRates[i] ?? 0),
  }))

  const raw = {
    projectId: formData.get("projectId"),
    clientId: formData.get("clientId"),
    dueDate: formData.get("dueDate"),
    currency: formData.get("currency") || "USD",
    notes: formData.get("notes"),
    footer: formData.get("footer"),
    discount: formData.get("discount") || "0",
    depositPercent: formData.get("depositPercent") || "0",
    items,
  }

  const parsed = createInvoiceSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten() }
  }

  const invoice = await createInvoice(session.studioId, session.userId, parsed.data)
  revalidatePath("/invoices")
  redirect(`/invoices/${invoice.id}`)
}

export async function sendInvoiceAction(invoiceId: string) {
  const session = await requireStudioAuth()
  await sendInvoice(session.studioId, session.userId, invoiceId)
  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath("/invoices")
  return { success: true }
}

export async function recordPaymentAction(invoiceId: string, formData: FormData) {
  const session = await requireStudioAuth()

  const amount = Number(formData.get("amount"))
  const method = formData.get("method") as string
  const reference = formData.get("reference") as string
  const paidAt = formData.get("paidAt") as string

  if (!amount || amount <= 0) return { error: "Monto inválido" }
  if (!method) return { error: "Selecciona un método de pago" }

  const result = await markInvoicePaid(session.studioId, session.userId, invoiceId, {
    amount,
    method,
    reference: reference || undefined,
    paidAt: paidAt ? new Date(paidAt) : undefined,
  })

  // Automatización: contar pagos completados del proyecto y mover de status.
  // 1er pago → "Reservado", 2do+ → "Sesión realizada".
  if (result.projectId) {
    try {
      await onPaymentRecorded(session.studioId, result.projectId)
    } catch (err) {
      console.error("[recordPaymentAction] automation onPaymentRecorded falló:", err)
    }
  }

  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath("/invoices")
  revalidatePath("/projects")
  return { success: true, ...result }
}

export async function deleteInvoiceAction(invoiceId: string) {
  const session = await requireStudioAuth()
  await deleteInvoice(session.studioId, session.userId, invoiceId)
  revalidatePath("/invoices")
  redirect("/invoices")
}
