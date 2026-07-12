"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  addBookMusicTrack,
  removeBookMusicTrack,
  type BookMusicTrack,
} from "@/server/services/book-music.service"

/**
 * Actions de la biblioteca de música del álbum (Luxury Book). El estudio sube el
 * archivo por /api/studio/book-music (devuelve url+nombre) y luego lo guarda en
 * su biblioteca reutilizable con estas actions.
 */

export async function addBookMusicTrackAction(
  galleryId: string,
  name: string,
  url: string,
): Promise<{ error?: string; library?: BookMusicTrack[] }> {
  const session = await requireStudioAuth()
  try {
    const library = await addBookMusicTrack(session.studioId, { name, url })
    revalidatePath(`/galleries/${galleryId}/book`)
    return { library }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar" }
  }
}

export async function removeBookMusicTrackAction(
  galleryId: string,
  id: string,
): Promise<{ error?: string; library?: BookMusicTrack[] }> {
  const session = await requireStudioAuth()
  try {
    const library = await removeBookMusicTrack(session.studioId, id)
    revalidatePath(`/galleries/${galleryId}/book`)
    return { library }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar" }
  }
}
