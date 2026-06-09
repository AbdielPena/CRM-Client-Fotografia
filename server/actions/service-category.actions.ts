"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createServiceCategory,
  updateServiceCategory,
  deleteServiceCategory,
} from "@/server/services/service-category.service"
import {
  createServiceCategorySchema,
  updateServiceCategorySchema,
} from "@/lib/validations/service-category.schema"

function revalidate() {
  revalidatePath("/settings/service-categories")
  // El selector de categoría en planes depende de la lista.
  revalidatePath("/settings/packages")
}

export async function createServiceCategoryAction(formData: FormData) {
  const session = await requireStudioAuth()
  const raw = {
    name: formData.get("name"),
    color: formData.get("color") || "#3b82f6",
    icon: formData.get("icon") || "tag",
    description: formData.get("description"),
    isActive: formData.get("isActive") !== "false",
  }
  const parsed = createServiceCategorySchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" }
  try {
    await createServiceCategory(session.studioId, parsed.data)
    revalidate()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" }
  }
}

export async function updateServiceCategoryAction(id: string, formData: FormData) {
  const session = await requireStudioAuth()
  const raw = {
    name: formData.get("name"),
    color: formData.get("color") || "#3b82f6",
    icon: formData.get("icon") || "tag",
    description: formData.get("description"),
    isActive: formData.get("isActive") !== "false",
  }
  const parsed = updateServiceCategorySchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" }
  try {
    await updateServiceCategory(session.studioId, id, parsed.data)
    revalidate()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" }
  }
}

export async function deleteServiceCategoryAction(id: string) {
  const session = await requireStudioAuth()
  try {
    await deleteServiceCategory(session.studioId, id)
    revalidate()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" }
  }
}
