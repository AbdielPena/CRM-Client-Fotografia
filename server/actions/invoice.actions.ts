"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createInvoice,
  updateInvoice,
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

export async function updateInvoiceAction(invoiceId: string, formData: FormData) {
  const session = await requireStudioAuth()

  const descriptions = formData.getAll("item_description") as string[]
  const quantities = formData.getAll("item_quantity") as string[]
  const unitPrices = formData.getAll("item_unitPrice") as string[]
  const taxRates = formData.getAll("item_taxRate") as string[]

  const items = descriptions
    .map((desc, i) => ({
      description: (desc ?? "").trim(),
      quantity: Number(quantities[i] ?? 1),
      unitPrice: Number(unitPrices[i] ?? 0),
      taxRate: Number(taxRates[i] ?? 0),
    }))
    .filter((it) => it.description.length > 0)

  if (items.length === 0) return { error: "Agrega al menos un ítem con descripción" }

  await updateInvoice(session.studioId, session.userId, invoiceId, {
    items,
    discount: Number(formData.get("discount") ?? 0),
    depositPercent: Number(formData.get("depositPercent") ?? 0),
    dueDate: (formData.get("dueDate") as string) || null,
    notes: (formData.get("notes") as string) || null,
    currency: (formData.get("currency") as string) || undefined,
  })

  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath("/invoices")
  redirect(`/invoices/${invoiceId}`)
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
  const accountIdRaw = formData.get("accountId") as string | null
  const accountId = accountIdRaw && accountIdRaw.trim() ? accountIdRaw.trim() : undefined

  if (!amount || amount <= 0) return { error: "Monto inválido" }
  if (!method) return { error: "Selecciona un método de pago" }

  const result = await markInvoicePaid(session.studioId, session.userId, invoiceId, {
    amount,
    method,
    reference: reference || undefined,
    paidAt: paidAt ? new Date(paidAt) : undefined,
    accountId,
  })

  // Automatización: al registrar un pago, el proyecto pasa a "Reservado"
  // (confirmado). "Sesión realizada" NO se infiere por conteo de pagos.
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
