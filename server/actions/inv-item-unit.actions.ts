"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createInvItemUnit,
  reportInvUnitLoss,
} from "@/server/services/inv-item-unit.service"
import {
  createInvItemUnitSchema,
  reportUnitLossSchema,
  type CreateInvItemUnitInput,
  type ReportUnitLossInput,
} from "@/lib/validations/inv-item-unit.schema"

export type InvUnitActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  unitId?: string
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

function mapErrorToMessage(code: string): string {
  switch (code) {
    case "INV_ITEM_NOT_FOUND":
      return "El item parent no existe o no pertenece a tu studio."
    case "INV_UNIT_REQUIRES_SERIALIZED_ITEM":
      return "Solo items kind='serialized' pueden tener unidades."
    case "INV_UNIT_DUPLICATE_SERIAL":
      return "Ya existe otra unidad con ese número de serie."
    case "INV_UNIT_DUPLICATE_INTERNAL_CODE":
      return "Ya existe otra unidad con ese código interno."
    case "INV_UNIT_DUPLICATE_QR":
      return "Ya existe otra unidad con ese QR code."
    case "INV_UNIT_NOT_FOUND":
      return "Unidad no encontrada."
    default:
      return code
  }
}

export async function createInvItemUnitAction(
  _prev: InvUnitActionState,
  formData: FormData,
): Promise<InvUnitActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)

  const raw = {
    itemId: formData.get("itemId"),
    serialNumber: (formData.get("serialNumber") as string) || undefined,
    internalCode: (formData.get("internalCode") as string) || undefined,
    qrCode: (formData.get("qrCode") as string) || undefined,
    barcode: (formData.get("barcode") as string) || undefined,
    physicalCondition:
      (formData.get("physicalCondition") as string) || undefined,
    operationalCondition:
      (formData.get("operationalCondition") as string) || undefined,
    currentLocationId:
      (formData.get("currentLocationId") as string) || undefined,
    purchaseDate: (formData.get("purchaseDate") as string) || undefined,
    purchasePrice: (formData.get("purchasePrice") as string) || undefined,
    estimatedValue: (formData.get("estimatedValue") as string) || undefined,
    warrantyExpiry: (formData.get("warrantyExpiry") as string) || undefined,
    provider: (formData.get("provider") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
  }

  const parsed = createInvItemUnitSchema.safeParse(raw)
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

  let unitId: string
  try {
    const unit = await createInvItemUnit(
      session.studioId,
      session.userId,
      parsed.data as CreateInvItemUnitInput,
    )
    unitId = unit.id
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

  revalidatePath(`/inventory/items/${parsed.data.itemId}/units`)
  revalidatePath(`/inventory/items/${parsed.data.itemId}`)
  redirect(`/inventory/items/${parsed.data.itemId}/units/${unitId}`)
}

export async function reportInvUnitLossAction(
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const raw = {
    unitId: formData.get("unitId"),
    kind: formData.get("kind"),
    reason: formData.get("reason"),
  }

  const parsed = reportUnitLossSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.errors[0]?.message ?? "Validación falló.",
    }
  }

  try {
    await reportInvUnitLoss(
      session.studioId,
      session.userId,
      parsed.data as ReportUnitLossInput,
    )
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? mapErrorToMessage(err.message)
          : "Error desconocido.",
    }
  }

  revalidatePath(`/inventory/items`)
  return {
    ok: true,
    message: parsed.data.kind === "perdida" ? "Marcada como perdida." : "Marcada como dañada.",
  }
}
