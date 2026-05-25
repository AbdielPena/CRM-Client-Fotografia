"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createInvLoan,
  returnInvLoan,
} from "@/server/services/inv-loan.service"
import {
  createInvLoanSchema,
  returnInvLoanSchema,
  type CreateInvLoanInput,
  type ReturnInvLoanInput,
} from "@/lib/validations/inv-loan.schema"

export type InvLoanActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  loanId?: string
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

function parseItemsFromForm(formData: FormData) {
  const items: Array<{
    itemId?: string
    itemUnitId?: string
    quantity: number
    conditionOut?: string
    notes?: string
  }> = []
  let i = 0
  while (true) {
    const itemId = formData.get(`items[${i}][itemId]`) as string | null
    const itemUnitId = formData.get(`items[${i}][itemUnitId]`) as string | null
    const quantity = formData.get(`items[${i}][quantity]`) as string | null
    if (!itemId && !itemUnitId) break
    if (!quantity) break
    items.push({
      itemId: itemId || undefined,
      itemUnitId: itemUnitId || undefined,
      quantity: Number(quantity),
      conditionOut:
        (formData.get(`items[${i}][conditionOut]`) as string | null) ?? undefined,
      notes: (formData.get(`items[${i}][notes]`) as string | null) ?? undefined,
    })
    i++
    if (i > 50) break
  }
  return items
}

export async function createInvLoanAction(
  _prev: InvLoanActionState,
  formData: FormData,
): Promise<InvLoanActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const items = parseItemsFromForm(formData)
  if (items.length === 0) {
    return { ok: false, message: "Agrega al menos 1 ítem.", values }
  }

  const raw = {
    responsibleId: formData.get("responsibleId"),
    startDate: formData.get("startDate"),
    expectedReturnDate: formData.get("expectedReturnDate"),
    notes: (formData.get("notes") as string) || undefined,
    signatureUrl: (formData.get("signatureUrl") as string) || undefined,
    bookingId: (formData.get("bookingId") as string) || undefined,
    projectId: (formData.get("projectId") as string) || undefined,
    items,
  }

  const parsed = createInvLoanSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  let loanId: string
  try {
    const loan = await createInvLoan(
      session.studioId,
      session.userId,
      parsed.data as CreateInvLoanInput,
    )
    loanId = loan.id
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
      values,
    }
  }

  revalidatePath("/inventory/loans")
  redirect(`/inventory/loans/${loanId}`)
}

export async function returnInvLoanAction(
  loanId: string,
  items: Array<{
    loanItemId: string
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

  const parsed = returnInvLoanSchema.safeParse({ loanId, items, notes })
  if (!parsed.success) {
    return { ok: false, message: "Validación falló." }
  }

  try {
    const result = await returnInvLoan(
      session.studioId,
      session.userId,
      parsed.data as ReturnInvLoanInput,
    )
    revalidatePath(`/inventory/loans/${loanId}`)
    revalidatePath("/inventory/loans")
    return {
      ok: true,
      message:
        result.status === "devuelto"
          ? "Préstamo totalmente devuelto"
          : "Devolución parcial registrada",
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
    }
  }
}
