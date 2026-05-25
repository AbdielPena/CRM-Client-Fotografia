"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  cancelInvMaintenance,
  completeInvMaintenance,
  createInvMaintenance,
} from "@/server/services/inv-maintenance.service"
import {
  completeInvMaintenanceSchema,
  createInvMaintenanceSchema,
  type CompleteInvMaintenanceInput,
  type CreateInvMaintenanceInput,
} from "@/lib/validations/inv-maintenance.schema"

export type InvMaintActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  maintenanceId?: string
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
    case "INV_MAINT_REQUIRES_ITEM_OR_UNIT":
      return "Especifica un item o unidad serializada."
    case "INV_MAINT_NOT_FOUND":
      return "Registro de mantenimiento no encontrado."
    case "INV_MAINT_ALREADY_DONE":
      return "Este mantenimiento ya está completado."
    case "INV_MAINT_CANCELLED":
      return "Este mantenimiento ya fue cancelado."
    case "INV_MAINT_CODE_GEN_FAILED":
      return "No se pudo generar el código. Intenta de nuevo."
    default:
      return code
  }
}

export async function createInvMaintenanceAction(
  _prev: InvMaintActionState,
  formData: FormData,
): Promise<InvMaintActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)

  const raw = {
    itemId: (formData.get("itemId") as string) || undefined,
    itemUnitId: (formData.get("itemUnitId") as string) || undefined,
    type: formData.get("type"),
    description: (formData.get("description") as string) || undefined,
    technician: (formData.get("technician") as string) || undefined,
    estimatedCost: (formData.get("estimatedCost") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
    startNow: formData.get("startNow") === "on",
  }

  const parsed = createInvMaintenanceSchema.safeParse(raw)
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

  let maintenanceId: string
  try {
    const row = await createInvMaintenance(
      session.studioId,
      session.userId,
      parsed.data as CreateInvMaintenanceInput,
    )
    maintenanceId = row.id
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

  revalidatePath("/inventory/maintenance")
  redirect(`/inventory/maintenance/${maintenanceId}`)
}

export async function completeInvMaintenanceAction(
  _prev: InvMaintActionState,
  formData: FormData,
): Promise<InvMaintActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)

  const raw = {
    maintenanceId: formData.get("maintenanceId"),
    finalCost: (formData.get("finalCost") as string) || undefined,
    nextMaintenanceDate:
      (formData.get("nextMaintenanceDate") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
  }

  const parsed = completeInvMaintenanceSchema.safeParse(raw)
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

  try {
    await completeInvMaintenance(
      session.studioId,
      session.userId,
      parsed.data as CompleteInvMaintenanceInput,
    )
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

  revalidatePath(`/inventory/maintenance/${parsed.data.maintenanceId}`)
  revalidatePath("/inventory/maintenance")
  return { ok: true, message: "Mantenimiento completado." }
}

export async function cancelInvMaintenanceAction(
  maintenanceId: string,
  reason?: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await cancelInvMaintenance(
      session.studioId,
      session.userId,
      maintenanceId,
      reason,
    )
    revalidatePath(`/inventory/maintenance/${maintenanceId}`)
    revalidatePath("/inventory/maintenance")
    return { ok: true, message: "Mantenimiento cancelado." }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
    }
  }
}
