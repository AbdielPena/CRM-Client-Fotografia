import "server-only"

import { randomUUID } from "node:crypto"

import { untypedService } from "@/server/supabase/untyped"

/**
 * Biblioteca de música REUTILIZABLE del Luxury Book, por estudio. El estudio
 * sube canciones desde archivos (endpoint /api/studio/book-music) y quedan
 * guardadas aquí como "predefinidas" para reusarlas en cualquier álbum sin
 * volver a subirlas. Persistida en `studio_branding.book_music_library` (jsonb).
 */

export interface BookMusicTrack {
  id: string
  name: string
  url: string
}

const MAX_TRACKS = 40

function sanitize(raw: unknown): BookMusicTrack[] {
  if (!Array.isArray(raw)) return []
  const out: BookMusicTrack[] = []
  for (const r of raw) {
    if (!r || typeof r !== "object") continue
    const t = r as Record<string, unknown>
    const url = typeof t.url === "string" ? t.url.trim() : ""
    if (!url) continue
    out.push({
      id: typeof t.id === "string" && t.id ? t.id : randomUUID(),
      name: (typeof t.name === "string" ? t.name.trim() : "").slice(0, 80) || "Canción",
      url,
    })
  }
  return out.slice(0, MAX_TRACKS)
}

async function readLibrary(studioId: string): Promise<BookMusicTrack[]> {
  const sb = untypedService()
  const { data } = await sb
    .from("studio_branding")
    .select("book_music_library")
    .eq("studio_id", studioId)
    .maybeSingle()
  return sanitize(
    (data as { book_music_library?: unknown } | null)?.book_music_library,
  )
}

async function writeLibrary(
  studioId: string,
  tracks: BookMusicTrack[],
): Promise<BookMusicTrack[]> {
  const sb = untypedService()
  // Asegura que exista la fila de branding (patrón get-or-create, igual que
  // studio-branding.service) antes de escribir.
  await sb.rpc("studio_get_or_create_branding", { p_studio_id: studioId })
  const { error } = await sb
    .from("studio_branding")
    .update({ book_music_library: tracks })
    .eq("studio_id", studioId)
  if (error) throw new Error(error.message)
  return tracks
}

export async function getBookMusicLibrary(
  studioId: string,
): Promise<BookMusicTrack[]> {
  return readLibrary(studioId)
}

export async function addBookMusicTrack(
  studioId: string,
  input: { name: string; url: string },
): Promise<BookMusicTrack[]> {
  const url = input.url.trim()
  if (!url) throw new Error("Falta la URL de la canción")
  const current = await readLibrary(studioId)
  // Dedupe por URL: si ya está, solo refresca el nombre (no duplica).
  const existing = current.find((t) => t.url === url)
  if (existing) {
    existing.name = input.name.trim().slice(0, 80) || existing.name
    return writeLibrary(studioId, current)
  }
  const track: BookMusicTrack = {
    id: randomUUID(),
    name: input.name.trim().slice(0, 80) || "Canción",
    url,
  }
  return writeLibrary(studioId, [track, ...current].slice(0, MAX_TRACKS))
}

export async function removeBookMusicTrack(
  studioId: string,
  id: string,
): Promise<BookMusicTrack[]> {
  const current = await readLibrary(studioId)
  return writeLibrary(
    studioId,
    current.filter((t) => t.id !== id),
  )
}
