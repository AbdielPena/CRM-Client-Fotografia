import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { untypedService } from "@/server/supabase/untyped"
import { isLocalStorage, localRead, localWrite } from "@/lib/storage/local-driver"
import {
  applyWatermark,
  getWatermarkConfig,
  type WatermarkConfig,
} from "./gallery-watermark.service"

/**
 * Rehace la marca de agua de las fotos YA subidas.
 *
 * No vuelve a procesar el original (eso tardaría horas y satura el servidor):
 * parte de las copias limpias que se guardan al lado de cada foto y sobrescribe
 * la miniatura y la foto grande **con la misma dirección de archivo**. Por eso
 * ningún enlace cambia: la galería, su token y sus vínculos quedan intactos.
 *
 * Es reanudable e idempotente: cada foto guarda con qué versión de la marca se
 * generó, así que se puede llamar en tandas hasta que `remaining` sea 0.
 */

const RENDITIONS_BUCKET = "gallery-renditions"

type AssetRow = {
  id: string
  thumb_key: string | null
  web_key: string | null
  metadata: Record<string, unknown> | null
}

function cleanKeyFor(key: string): string {
  // ".../thumb.webp" → ".../thumb-clean.webp"
  return key.replace(/\/(thumb|web)\.webp$/, "/$1-clean.webp")
}

async function readObject(key: string): Promise<Buffer | null> {
  if (isLocalStorage()) {
    try {
      return await localRead(RENDITIONS_BUCKET, key)
    } catch {
      return null
    }
  }
  const svc = createSupabaseServiceClient()
  const { data, error } = await svc.storage.from(RENDITIONS_BUCKET).download(key)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

async function writeObject(key: string, buf: Buffer): Promise<void> {
  if (isLocalStorage()) {
    await localWrite(RENDITIONS_BUCKET, key, buf)
    return
  }
  const svc = createSupabaseServiceClient()
  const { error } = await svc.storage
    .from(RENDITIONS_BUCKET)
    .upload(key, buf, { contentType: "image/webp", upsert: true })
  if (error) throw error
}

/**
 * Devuelve la versión limpia de una rendition, creándola la primera vez.
 *
 * Si aún no existe la copia limpia es porque esa foto nunca tuvo marca: la que
 * está publicada ES la limpia, así que se guarda tal cual como respaldo antes
 * de escribirle la marca encima.
 */
async function ensureClean(key: string): Promise<Buffer | null> {
  const cKey = cleanKeyFor(key)
  const existing = await readObject(cKey)
  if (existing) return existing

  const current = await readObject(key)
  if (!current) return null
  await writeObject(cKey, current)
  return current
}

async function rebuildOne(
  asset: AssetRow,
  config: WatermarkConfig | null,
  version: number,
): Promise<void> {
  const svc = untypedService()

  for (const [key, quality] of [
    [asset.thumb_key, 75],
    [asset.web_key, 82],
  ] as Array<[string | null, number]>) {
    if (!key) continue
    const clean = await ensureClean(key)
    if (!clean) continue
    // Sin config = la galería no lleva marca (entrega final o apagada):
    // se restaura la versión limpia.
    const out = config ? await applyWatermark(clean, config, { quality }) : clean
    await writeObject(key, out)
  }

  await svc
    .from("gallery_assets")
    .update({
      metadata: { ...(asset.metadata ?? {}), wm_v: version },
    })
    .eq("id", asset.id)
}

export async function rebuildGalleryWatermarks(params: {
  studioId: string
  galleryId: string
  /** Fotos por tanda. La UI llama en bucle hasta remaining=0. */
  limit?: number
  concurrency?: number
}): Promise<{ processed: number; remaining: number; total: number }> {
  const { studioId, galleryId } = params
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100)
  const concurrency = Math.min(Math.max(params.concurrency ?? 4, 1), 8)

  const svc = untypedService()

  const { data: gal } = await svc
    .from("galleries")
    .select("watermark_version")
    .eq("id", galleryId)
    .eq("studio_id", studioId)
    .maybeSingle()
  const version = Number(
    (gal as { watermark_version?: number } | null)?.watermark_version ?? 0,
  )

  const config = await getWatermarkConfig(galleryId)

  const { count: total } = await svc
    .from("gallery_assets")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)

  // Pendientes = las que no llevan sello de esta versión de la marca.
  const { data: rows } = await svc
    .from("gallery_assets")
    .select("id, thumb_key, web_key, metadata")
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
    .eq("status", "completed")
    .or(`metadata->>wm_v.is.null,metadata->>wm_v.neq.${version}`)
    .order("created_at", { ascending: true })
    .limit(limit)

  const batch = (rows ?? []) as unknown as AssetRow[]

  // Tandas cortas y controladas: nunca todo de golpe (así fue como antes se
  // saturó el servidor y las fotos quedaron atascadas).
  for (let i = 0; i < batch.length; i += concurrency) {
    const slice = batch.slice(i, i + concurrency)
    await Promise.all(
      slice.map((a) =>
        rebuildOne(a, config, version).catch((err) => {
          console.error("[watermark-rebuild] falló", a.id, err)
        }),
      ),
    )
  }

  const { count: remaining } = await svc
    .from("gallery_assets")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
    .eq("status", "completed")
    .or(`metadata->>wm_v.is.null,metadata->>wm_v.neq.${version}`)

  return {
    processed: batch.length,
    remaining: remaining ?? 0,
    total: total ?? 0,
  }
}
