"use server"

import { revalidatePath } from "next/cache"
import { requireStudioAuth } from "@/server/middleware/auth"
import { createPackage, updatePackage, deletePackage } from "@/server/services/package.service"
import { createPackageSchema, updatePackageSchema } from "@/lib/validations/package.schema"
import { normalizeEntitlements, type PrintEntitlements } from "@/lib/print/entitlements"

function parsePrintEntitlements(
  raw: FormDataEntryValue | null,
): PrintEntitlements | undefined {
  if (typeof raw !== "string" || !raw) return undefined
  try {
    return normalizeEntitlements(JSON.parse(raw))
  } catch {
    return undefined
  }
}

export async function createPackageAction(formData: FormData) {
  const session = await requireStudioAuth()

  const raw = {
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    currency: formData.get("currency") || "USD",
    durationHours: formData.get("durationHours"),
    editedPhotos: formData.get("editedPhotos"),
    deliveryDays: formData.get("deliveryDays"),
    includes: formData.get("includes"),
    isActive: formData.get("isActive") !== "false",
    contractTemplateId: formData.get("contractTemplateId"),
    formTemplateId: formData.get("formTemplateId"),
    serviceCategoryId: formData.get("serviceCategoryId"),
  }

  const parsed = createPackageSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  await createPackage(
    session.studioId,
    parsed.data,
    parsePrintEntitlements(formData.get("printEntitlements")),
  )
  revalidatePath("/settings/packages")
  return { success: true }
}

export async function updatePackageAction(packageId: string, formData: FormData) {
  const session = await requireStudioAuth()

  const raw = {
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    durationHours: formData.get("durationHours"),
    editedPhotos: formData.get("editedPhotos"),
    deliveryDays: formData.get("deliveryDays"),
    includes: formData.get("includes"),
    isActive: formData.get("isActive") !== "false",
    contractTemplateId: formData.get("contractTemplateId"),
    formTemplateId: formData.get("formTemplateId"),
    serviceCategoryId: formData.get("serviceCategoryId"),
  }

  const parsed = updatePackageSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  await updatePackage(
    session.studioId,
    packageId,
    parsed.data,
    parsePrintEntitlements(formData.get("printEntitlements")),
  )
  revalidatePath("/settings/packages")
  return { success: true }
}

export async function deletePackageAction(packageId: string) {
  const session = await requireStudioAuth()
  await deletePackage(session.studioId, packageId)
  revalidatePath("/settings/packages")
  return { success: true }
}
