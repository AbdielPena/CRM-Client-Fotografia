"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  addGalleryAssetsToPortfolio,
  removePortfolioItem,
  reorderPortfolioItems,
  setPortfolioPublished,
  updatePortfolioItem,
  uploadPortfolioItem,
} from "@/server/services/portfolio.service"

function revalidate() {
  revalidatePath("/portfolio")
}

/**
 * Añade al portafolio SOLO las fotos que el estudio marcó en la galería.
 * Nunca la galería entera: los ids llegan de la selección explícita.
 */
export async function addToPortfolioAction(assetIds: string[], categoryId: string) {
  const session = await requireStudioAuth()
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return { error: "No seleccionaste ninguna foto" }
  }
  if (!categoryId) return { error: "Elige una categoría" }
  try {
    const r = await addGalleryAssetsToPortfolio(session.studioId, assetIds, categoryId)
    revalidate()
    return { success: true, ...r }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo añadir al portafolio" }
  }
}

export async function uploadPortfolioItemAction(formData: FormData) {
  const session = await requireStudioAuth()
  const file = formData.get("file")
  const categoryId = String(formData.get("categoryId") ?? "")
  if (!(file instanceof File) || file.size === 0) return { error: "Elige una imagen" }
  if (!categoryId) return { error: "Elige una categoría" }
  if (!file.type.startsWith("image/")) return { error: "El archivo no es una imagen" }
  if (file.size > 15 * 1024 * 1024) return { error: "La imagen supera los 15 MB" }

  try {
    const width = Number(formData.get("width")) || null
    const height = Number(formData.get("height")) || null
    await uploadPortfolioItem(session.studioId, {
      file: await file.arrayBuffer(),
      contentType: file.type,
      categoryId,
      title: (formData.get("title") as string) || null,
      description: (formData.get("description") as string) || null,
      projectId: (formData.get("projectId") as string) || null,
      published: formData.get("published") === "true",
      width,
      height,
    })
    revalidate()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo subir" }
  }
}

export async function updatePortfolioItemAction(
  itemId: string,
  patch: {
    categoryId?: string
    title?: string | null
    description?: string | null
    published?: boolean
  },
) {
  const session = await requireStudioAuth()
  try {
    await updatePortfolioItem(session.studioId, itemId, patch)
    revalidate()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo actualizar" }
  }
}

/** Publicar / despublicar sin borrar. */
export async function togglePortfolioPublishedAction(itemId: string, published: boolean) {
  const session = await requireStudioAuth()
  try {
    await setPortfolioPublished(session.studioId, itemId, published)
    revalidate()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cambiar" }
  }
}

export async function removePortfolioItemAction(itemId: string) {
  const session = await requireStudioAuth()
  try {
    await removePortfolioItem(session.studioId, itemId)
    revalidate()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo quitar" }
  }
}

export async function reorderPortfolioAction(orderedIds: string[]) {
  const session = await requireStudioAuth()
  try {
    await reorderPortfolioItems(session.studioId, orderedIds)
    revalidate()
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo reordenar" }
  }
}
