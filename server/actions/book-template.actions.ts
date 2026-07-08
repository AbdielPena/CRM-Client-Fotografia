"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createBookTemplate,
  deleteBookTemplate,
} from "@/server/services/book-template.service"

const configSchema = z
  .object({
    accent: z.string().max(20).optional(),
    showLogo: z.boolean().optional(),
    bookTemplateId: z.enum(["luxury_xv", "luxury_wedding"]).optional(),
    cover: z.record(z.unknown()).optional(),
    pagePattern: z
      .array(z.enum(["single", "full", "duo", "trio", "collage", "magazine"]))
      .max(400)
      .optional(),
  })
  .passthrough()

export async function saveBookTemplateAction(
  galleryId: string,
  name: string,
  config: unknown,
): Promise<{ error?: string; id?: string }> {
  const session = await requireStudioAuth()
  const parsed = configSchema.safeParse(config)
  if (!parsed.success) return { error: "Configuración inválida" }
  if (!name.trim()) return { error: "Ponle un nombre a la plantilla" }
  try {
    const { id } = await createBookTemplate(session.studioId, name, parsed.data)
    revalidatePath(`/galleries/${galleryId}/book`)
    return { id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar" }
  }
}

export async function deleteBookTemplateAction(
  galleryId: string,
  id: string,
): Promise<{ error?: string; success?: true }> {
  const session = await requireStudioAuth()
  try {
    await deleteBookTemplate(session.studioId, id)
    revalidatePath(`/galleries/${galleryId}/book`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar" }
  }
}
