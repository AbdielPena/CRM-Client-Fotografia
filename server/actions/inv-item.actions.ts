"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createInvItem, updateInvItem, deleteInvItem } from "@/server/services/inv-item.service"
import {
  createInvItemSchema,
  updateInvItemSchema,
  type CreateInvItemInput,
  type UpdateInvItemInput,
} from "@/lib/validations/inv-item.schema"

// ---------------------------------------------------------------------------
// Tipos para useActionState
// ---------------------------------------------------------------------------

export type InvItemActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  itemId?: string
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

export async function createInvItemAction(
  _prevState: InvItemActionState,
  formData: FormData,
): Promise<InvItemActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró. Vuelve a iniciar sesión." }
  }

  const values = collectValues(formData)
  const raw = {
    kind: formData.get("kind"),
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    subcategoryId: formData.get("subcategoryId"),
    brand: formData.get("brand"),
    model: formData.get("model"),
    description: formData.get("description"),
    internalCode: formData.get("internalCode"),
    defaultPurchasePrice: formData.get("defaultPurchasePrice"),
    defaultEstimatedValue: formData.get("defaultEstimatedValue"),
    defaultRentalPricePerDay: formData.get("defaultRentalPricePerDay"),
    provider: formData.get("provider"),
    quantityTotal: Number(formData.get("quantityTotal") ?? 0),
    minStock: Number(formData.get("minStock") ?? 0),
    maxStock: formData.get("maxStock") ? Number(formData.get("maxStock")) : undefined,
    defaultLocationId: formData.get("defaultLocationId"),
    notes: formData.get("notes"),
  }

  const parsed = createInvItemSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló — revisa los campos marcados.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  let createdId: string
  try {
    const item = await createInvItem(
      session.studioId,
      session.userId,
      parsed.data as CreateInvItemInput,
    )
    createdId = item.id
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido al crear item.",
      values,
    }
  }

  revalidatePath("/inventory/items")
  redirect(`/inventory/items/${createdId}`)
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

export async function updateInvItemAction(
  itemId: string,
  _prevState: InvItemActionState,
  formData: FormData,
): Promise<InvItemActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const raw: Record<string, unknown> = {}
  // Solo mete claves presentes en el form (update parcial)
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && v !== "") raw[k] = v
  }
  // Coerce numéricos
  if (typeof raw.minStock === "string") raw.minStock = Number(raw.minStock)
  if (typeof raw.maxStock === "string") raw.maxStock = Number(raw.maxStock)
  if (typeof raw.defaultPurchasePrice === "string")
    raw.defaultPurchasePrice = Number(raw.defaultPurchasePrice)
  if (typeof raw.defaultEstimatedValue === "string")
    raw.defaultEstimatedValue = Number(raw.defaultEstimatedValue)
  if (typeof raw.defaultRentalPricePerDay === "string")
    raw.defaultRentalPricePerDay = Number(raw.defaultRentalPricePerDay)

  const parsed = updateInvItemSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  try {
    await updateInvItem(
      session.studioId,
      session.userId,
      itemId,
      parsed.data as UpdateInvItemInput,
    )
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido al actualizar.",
      values,
    }
  }

  revalidatePath(`/inventory/items/${itemId}`)
  revalidatePath("/inventory/items")
  return { ok: true, message: "Item actualizado." }
}

// ---------------------------------------------------------------------------
// DELETE (soft)
// ---------------------------------------------------------------------------

export async function deleteInvItemAction(
  itemId: string,
  reason?: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await deleteInvItem(session.studioId, session.userId, itemId, reason ?? null)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido."
    if (msg === "INV_ITEM_HAS_ACTIVE_UNITS") {
      return {
        ok: false,
        message:
          "No se puede borrar: el item tiene unidades en préstamo/renta/mantenimiento.",
      }
    }
    return { ok: false, message: msg }
  }

  revalidatePath("/inventory/items")
  return { ok: true, message: "Item movido a papelera." }
}
