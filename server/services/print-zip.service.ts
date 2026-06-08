import "server-only"

import archiver from "archiver"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { untypedService } from "@/server/supabase/untyped"

/**
 * Arma el ZIP de PRODUCCIÓN para impresión, organizado por carpetas según la
 * selección del cliente. Usa el ORIGINAL (máxima calidad) de cada foto.
 *
 *   Portada de Album/
 *   Marcos/<tamaño>/
 *   Impresiones/<tamaño>/
 */

const ORIGINALS_BUCKET = "gallery-originals"

export type PrintZipScope = "all" | "album" | "frames" | "prints"

function sanitize(s: string): string {
  return (s || "").replace(/[/\\:*?"<>|]+/g, "-").trim() || "_"
}

function folderFor(type: string, spec: string | null): string {
  if (type === "album_cover") return "Portada de Album/"
  if (type === "frame") return `Marcos/${sanitize(spec ?? "sin-tamano")}/`
  return `Impresiones/${sanitize(spec ?? "sin-tamano")}/`
}

export interface PrintZipResult {
  buffer: Buffer
  count: number
  galleryName: string
  clientName: string
}

export async function buildPrintZip(
  studioId: string,
  galleryId: string,
  scope: PrintZipScope,
): Promise<PrintZipResult | null> {
  const sb = untypedService()

  // Galería (verifica studio) + cliente
  const { data: gRow } = await sb
    .from("galleries")
    .select("id, studio_id, name, client_id")
    .eq("id", galleryId)
    .maybeSingle()
  const gallery = gRow as {
    id: string
    studio_id: string
    name: string
    client_id: string | null
  } | null
  if (!gallery || gallery.studio_id !== studioId) return null

  let clientName = "Cliente"
  if (gallery.client_id) {
    const { data: c } = await sb
      .from("clients")
      .select("name")
      .eq("id", gallery.client_id)
      .maybeSingle()
    clientName = (c as { name?: string } | null)?.name ?? clientName
  }

  // Selecciones (filtradas por scope)
  let q = sb
    .from("gallery_print_selections")
    .select("asset_id, selection_type, spec")
    .eq("gallery_id", galleryId)
  if (scope === "album") q = q.eq("selection_type", "album_cover")
  else if (scope === "frames") q = q.eq("selection_type", "frame")
  else if (scope === "prints") q = q.eq("selection_type", "print")
  const { data: selRaw } = await q
  const selections = (selRaw ?? []) as Array<{
    asset_id: string
    selection_type: string
    spec: string | null
  }>
  if (selections.length === 0) {
    return { buffer: Buffer.alloc(0), count: 0, galleryName: gallery.name, clientName }
  }

  // Assets (original_key + nombre)
  const assetIds = [...new Set(selections.map((s) => s.asset_id))]
  const { data: assetsRaw } = await sb
    .from("gallery_assets")
    .select("id, original_key, original_name")
    .in("id", assetIds)
  const assetById = new Map(
    ((assetsRaw ?? []) as Array<{ id: string; original_key: string | null; original_name: string | null }>).map(
      (a) => [a.id, a],
    ),
  )

  const supabase = createSupabaseServiceClient()
  const archive = archiver("zip", { zlib: { level: 6 } })
  const chunks: Buffer[] = []
  archive.on("data", (c: Buffer) => chunks.push(c))
  const done = new Promise<void>((resolve, reject) => {
    archive.on("end", () => resolve())
    archive.on("error", reject)
  })

  const usedNames = new Map<string, number>()
  let count = 0
  for (const sel of selections) {
    const asset = assetById.get(sel.asset_id)
    if (!asset?.original_key) continue
    const { data: blob, error } = await supabase.storage
      .from(ORIGINALS_BUCKET)
      .download(asset.original_key)
    if (error || !blob) {
      console.error("[print-zip] download failed", sel.asset_id, error)
      continue
    }
    const buf = Buffer.from(await blob.arrayBuffer())

    const folder = folderFor(sel.selection_type, sel.spec)
    let name = asset.original_name || `${asset.id}.jpg`
    const full = folder + name
    const seen = usedNames.get(full) ?? 0
    if (seen > 0) {
      const dot = name.lastIndexOf(".")
      name = dot > 0 ? `${name.slice(0, dot)}_${seen + 1}${name.slice(dot)}` : `${name}_${seen + 1}`
    }
    usedNames.set(full, seen + 1)

    archive.append(buf, { name: folder + name })
    count++
  }

  await archive.finalize()
  await done

  return {
    buffer: Buffer.concat(chunks),
    count,
    galleryName: gallery.name,
    clientName,
  }
}
