"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createInvRental,
  recordRentalPayment,
  returnInvRental,
} from "@/server/services/inv-rental.service"
import {
  createInvRentalSchema,
  recordRentalPaymentSchema,
  returnInvRentalSchema,
  type CreateInvRentalInput,
  type RecordRentalPaymentInput,
  type ReturnInvRentalInput,
} from "@/lib/validations/inv-rental.schema"

export type InvRentalActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  rentalId?: string
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

/**
 * Parsea items del form. Format esperado:
 *   items[0][itemId]=uuid
 *   items[0][quantity]=2
 *   items[0][pricePerDay]=100.00
 *   items[0][notes]=optional
 */
function parseItemsFromForm(formData: FormData) {
  const items: Array<{
    itemId?: string
    itemUnitId?: string
    quantity: number
    pricePerDay: number
    notes?: string
  }> = []
  let i = 0
  while (true) {
    const itemId = formData.get(`items[${i}][itemId]`) as string | null
    const itemUnitId = formData.get(`items[${i}][itemUnitId]`) as string | null
    const quantity = formData.get(`items[${i}][quantity]`) as string | null
    const pricePerDay = formData.get(`items[${i}][pricePerDay]`) as string | null
    const notes = formData.get(`items[${i}][notes]`) as string | null

    if (!itemId && !itemUnitId) break
    if (!quantity || !pricePerDay) break

    items.push({
      itemId: itemId || undefined,
      itemUnitId: itemUnitId || undefined,
      quantity: Number(quantity),
      pricePerDay: Number(pricePerDay),
      notes: notes || undefined,
    })
    i++
    if (i > 50) break
  }
  return items
}

export async function createInvRentalAction(
  _prev: InvRentalActionState,
  formData: FormData,
): Promise<InvRentalActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const items = parseItemsFromForm(formData)
  if (items.length === 0) {
    return {
      ok: false,
      message: "Debes agregar al menos 1 ítem al alquiler.",
      values,
    }
  }

  const raw = {
    clientId: formData.get("clientId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    deposit: formData.get("deposit") || undefined,
    discount: formData.get("discount") || undefined,
    tax: formData.get("tax") || undefined,
    notes: formData.get("notes") || undefined,
    projectId: formData.get("projectId") || undefined,
    items,
  }

  const parsed = createInvRentalSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  let rentalId: string
  try {
    const rental = await createInvRental(
      session.studioId,
      session.userId,
      parsed.data as CreateInvRentalInput,
    )
    rentalId = rental.id
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error al crear alquiler.",
      values,
    }
  }

  revalidatePath("/inventory/rentals")
  redirect(`/inventory/rentals/${rentalId}`)
}

export async function recordRentalPaymentAction(
  _prev: InvRentalActionState,
  formData: FormData,
): Promise<InvRentalActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const raw = {
    rentalId: formData.get("rentalId"),
    monto: formData.get("monto"),
    method: formData.get("method"),
    reference: formData.get("reference") || undefined,
    paidAt: formData.get("paidAt") || undefined,
    notes: formData.get("notes") || undefined,
    finAccountId: formData.get("finAccountId") || undefined,
  }

  const parsed = recordRentalPaymentSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  try {
    const result = await recordRentalPayment(
      session.studioId,
      session.userId,
      parsed.data as RecordRentalPaymentInput,
    )
    revalidatePath(`/inventory/rentals/${parsed.data.rentalId}`)
    return {
      ok: true,
      message: `Pago registrado. Acumulado: ${result.paidAmount}.`,
      rentalId: parsed.data.rentalId,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido."
    const messages: Record<string, string> = {
      INV_RENTAL_NOT_FOUND: "Alquiler no encontrado.",
      INV_RENTAL_PAYMENT_EXCEEDS: "El monto excede el balance pendiente.",
    }
    return { ok: false, message: messages[msg] ?? msg, values }
  }
}

export async function returnInvRentalAction(
  rentalId: string,
  items: Array<{
    rentalItemId: string
    returnedQuantity: number
    conditionIn?: string
    notes?: string
  }>,
  notes?: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const parsed = returnInvRentalSchema.safeParse({
    rentalId,
    items,
    notes,
  })
  if (!parsed.success) {
    return { ok: false, message: "Validación falló." }
  }

  try {
    const result = await returnInvRental(
      session.studioId,
      session.userId,
      parsed.data as ReturnInvRentalInput,
    )
    revalidatePath(`/inventory/rentals/${rentalId}`)
    revalidatePath("/inventory/rentals")
    return {
      ok: true,
      message: result.fullyReturned ? "Alquiler totalmente devuelto" : "Devolución parcial registrada",
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
    }
  }
}
