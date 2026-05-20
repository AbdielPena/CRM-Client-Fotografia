"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  cancelInvReservation,
  confirmInvReservation,
  createInvReservation,
} from "@/server/services/inv-reservation.service"
import {
  createInvReservationSchema,
  type CreateInvReservationInput,
} from "@/lib/validations/inv-reservation.schema"

export type InvReservationActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  reservationId?: string
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
    })
    i++
    if (i > 50) break
  }
  return items
}

function mapErrorToMessage(code: string): string {
  switch (code) {
    case "INV_RESERVATION_REQUIRES_CLIENT_OR_RESPONSIBLE":
      return "Especifica cliente o responsible interno."
    case "INV_RESERVATION_REQUIRES_ITEMS":
      return "Agrega al menos 1 ítem."
    case "INV_RESERVATION_END_BEFORE_START":
      return "La fecha de fin debe ser posterior al inicio."
    case "INV_RESERVATION_CODE_GEN_FAILED":
      return "No se pudo generar el código. Intenta de nuevo."
    default:
      return code
  }
}

export async function createInvReservationAction(
  _prev: InvReservationActionState,
  formData: FormData,
): Promise<InvReservationActionState> {
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
    clientId: (formData.get("clientId") as string) || undefined,
    responsibleId: (formData.get("responsibleId") as string) || undefined,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    reason: (formData.get("reason") as string) || undefined,
    expiresAt: (formData.get("expiresAt") as string) || undefined,
    items,
  }

  const parsed = createInvReservationSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
      values,
    }
  }

  let reservationId: string
  try {
    const reservation = await createInvReservation(
      session.studioId,
      session.userId,
      parsed.data as CreateInvReservationInput,
    )
    reservationId = reservation.id
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? mapErrorToMessage(err.message)
          : "Error desconocido.",
      values,
    }
  }

  revalidatePath("/inventory/reservations")
  redirect(`/inventory/reservations/${reservationId}`)
}

export async function confirmInvReservationAction(
  reservationId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await confirmInvReservation(
      session.studioId,
      session.userId,
      reservationId,
    )
    revalidatePath(`/inventory/reservations/${reservationId}`)
    revalidatePath("/inventory/reservations")
    return { ok: true, message: "Reserva confirmada." }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
    }
  }
}

export async function cancelInvReservationAction(
  reservationId: string,
  reason?: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await cancelInvReservation(
      session.studioId,
      session.userId,
      reservationId,
      reason,
    )
    revalidatePath(`/inventory/reservations/${reservationId}`)
    revalidatePath("/inventory/reservations")
    return { ok: true, message: "Reserva cancelada." }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
    }
  }
}
