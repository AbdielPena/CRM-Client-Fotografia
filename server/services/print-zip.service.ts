import "server-only"

import archiver from "archiver"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { untypedService } from "@/server/supabase/untyped"
import { normalizeEntitlements, EMPTY_ENTITLEMENTS } from "@/lib/print/entitlements"
import { listDeliveredAssets } from "./print-selection.service"

/**
 * Arma el ZIP de PRODUCCIÓN para impresión, organizado por carpetas según la
 * selección del cliente + lo que el plan imprime automáticamente. Usa el
 * ORIGINAL (máxima calidad) de cada foto de ENTREGA FINAL.
 *
 *   TODAS LAS ENTREGADAS DIGITALES/     ← todas las fotos entregadas (siempre)
 *   PORTADA - Álbum <tamaño>/           ← foto elegida para portada
 *   Marco <tamaño>/                     ← foto(s) elegida(s) por marco
 *   <tamaño>/  (ej. 5x7/)               ← impresiones (selección o todas si es auto)
 */

const ORIGINALS_BUCKET = "gallery-originals"

export type PrintZipScope = "all" | "album" | "frames" | "prints" | "digitales"

const DIGITAL_FOLDER = "TODAS LAS ENTREGADAS DIGITALES/"

function sanitize(s: string): string {
  return (s || "").replace(/[/\\:*?"<>|]+/g, "-").trim() || "_"
}

function coverFolder(albumSize: string | null): string {
  return albumSize ? `PORTADA - Álbum ${sanitize(albumSize)}/` : "PORTADA/"
}
function frameFolder(spec: string | null): string {
  return `Marco ${sanitize(spec ?? "sin-tamano")}/`
}
function printFolder(spec: string | null): string {
  return `${sanitize(spec ?? "sin-tamano")}/`
}

interface ZipEntry {
  folder: string
  originalKey: string
  originalName: string | null
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

  // Galería (verifica studio) + cliente + plan
  const { data: gRow } = await sb
    .from("galleries")
    .select("id, studio_id, name, client_id, package_id, project_id")
    .eq("id", galleryId)
    .maybeSingle()
  const gallery = gRow as {
    id: string
    studio_id: string
    name: string
    client_id: string | null
    package_id: string | null
    project_id: string | null
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

  // Entregables del plan (tamaño de álbum + tamaños automáticos). El plan puede
  // estar en la galería o, si no lo heredó, en el proyecto.
  let entitlements = EMPTY_ENTITLEMENTS
  let packageId = gallery.package_id
  if (!packageId && gallery.project_id) {
    const { data: proj } = await sb
      .from("projects")
      .select("package_id")
      .eq("id", gallery.project_id)
      .maybeSingle()
    packageId = (proj as { package_id?: string | null } | null)?.package_id ?? null
  }
  if (packageId) {
    const { data: pkg } = await sb
      .from("packages")
      .select("print_entitlements")
      .eq("id", packageId)
      .maybeSingle()
    entitlements = normalizeEntitlements(
      (pkg as { print_entitlements?: unknown } | null)?.print_entitlements,
    )
  }
  const albumSize = entitlements.album_size
  const autoSizes = Object.keys(entitlements.print_modes).filter(
    (size) => entitlements.print_modes[size] === "auto",
  )

  const entries: ZipEntry[] = []

  // 1) Selecciones del cliente (portada / marcos / impresiones manuales).
  const wantSelections =
    scope === "all" || scope === "album" || scope === "frames" || scope === "prints"
  if (wantSelections) {
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

    if (selections.length) {
      const assetIds = [...new Set(selections.map((s) => s.asset_id))]
      const { data: assetsRaw } = await sb
        .from("gallery_assets")
        .select("id, original_key, original_name")
        .in("id", assetIds)
      const assetById = new Map(
        ((assetsRaw ?? []) as Array<{
          id: string
          original_key: string | null
          original_name: string | null
        }>).map((a) => [a.id, a]),
      )
      for (const sel of selections) {
        const asset = assetById.get(sel.asset_id)
        if (!asset?.original_key) continue
        const folder =
          sel.selection_type === "album_cover"
            ? coverFolder(albumSize)
            : sel.selection_type === "frame"
              ? frameFolder(sel.spec)
              : printFolder(sel.spec)
        entries.push({
          folder,
          originalKey: asset.original_key,
          originalName: asset.original_name,
        })
      }
    }
  }

  // Fotos de entrega final (para tamaños automáticos + carpeta de digitales).
  const needDelivered =
    scope === "all" ||
    scope === "digitales" ||
    (scope === "prints" && autoSizes.length > 0)
  const delivered = needDelivered ? await listDeliveredAssets(galleryId) : []

  // 2) Impresiones AUTOMÁTICAS: todas las entregadas en la carpeta del tamaño.
  if (scope === "all" || scope === "prints") {
    for (const size of autoSizes) {
      for (const d of delivered) {
        if (d.originalKey) {
          entries.push({ folder: printFolder(size), originalKey: d.originalKey, originalName: d.originalName })
        }
      }
    }
  }

  // 3) TODAS LAS ENTREGADAS DIGITALES (siempre, en scope all o digitales).
  if (scope === "all" || scope === "digitales") {
    for (const d of delivered) {
      if (d.originalKey) {
        entries.push({ folder: DIGITAL_FOLDER, originalKey: d.originalKey, originalName: d.originalName })
      }
    }
  }

  if (entries.length === 0) {
    return { buffer: Buffer.alloc(0), count: 0, galleryName: gallery.name, clientName }
  }

  const supabase = createSupabaseServiceClient()
  const archive = archiver("zip", { zlib: { level: 6 } })
  const chunks: Buffer[] = []
  archive.on("data", (c: Buffer) => chunks.push(c))
  const done = new Promise<void>((resolve, reject) => {
    archive.on("end", () => resolve())
    archive.on("error", reject)
  })

  // Cache de descargas: una misma foto puede ir a varias carpetas (ej. 5x7 auto
  // + digitales) — se descarga una sola vez.
  const blobCache = new Map<string, Buffer | null>()
  async function downloadOriginal(key: string): Promise<Buffer | null> {
    if (blobCache.has(key)) return blobCache.get(key) ?? null
    const { data: blob, error } = await supabase.storage.from(ORIGINALS_BUCKET).download(key)
    if (error || !blob) {
      console.error("[print-zip] download failed", key, error)
      blobCache.set(key, null)
      return null
    }
    const buf = Buffer.from(await blob.arrayBuffer())
    blobCache.set(key, buf)
    return buf
  }

  const usedNames = new Map<string, number>()
  let count = 0
  for (const entry of entries) {
    const buf = await downloadOriginal(entry.originalKey)
    if (!buf) continue

    let name = entry.originalName || `${entry.originalKey.split("/").pop() ?? "foto"}.jpg`
    const full = entry.folder + name
    const seen = usedNames.get(full) ?? 0
    if (seen > 0) {
      const dot = name.lastIndexOf(".")
      name = dot > 0 ? `${name.slice(0, dot)}_${seen + 1}${name.slice(dot)}` : `${name}_${seen + 1}`
    }
    usedNames.set(full, seen + 1)

    archive.append(buf, { name: entry.folder + name })
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
