// ─── Watermark service ──────────────────────────────────────────────────────
// Aplica marca de agua (texto o imagen) a las renditions que ve el cliente.
// El original nunca se toca: queda intacto en privado.
//
// Reglas del negocio:
//   · Las galerías de SELECCIÓN llevan marca de agua. Por defecto usan la
//     configuración del estudio (Configuración → Marca de agua); cada galería
//     puede desmarcar esa herencia y ajustar la suya.
//   · Las galerías de ENTREGA FINAL nunca llevan marca — esas fotos ya son del
//     cliente. Se fuerza aquí, sin depender de banderas sueltas.

import "server-only"

import sharp, { type OverlayOptions } from "sharp"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { untypedService } from "@/server/supabase/untyped"
import { isLocalStorage, localRead } from "@/lib/storage/local-driver"

const WATERMARKS_BUCKET = "gallery-watermarks"

export type WatermarkPosition =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "tile"

export type WatermarkConfig = {
  enabled: boolean
  mode: "text" | "image" | null
  text: string | null
  imageKey: string | null
  position: WatermarkPosition
  /** 0..1 */
  opacity: number
  /** Ancho de la marca como % del ancho de la foto (3..100). */
  scale: number
  /** Giro en grados (-180..180). */
  rotation: number
  /** Separación del borde como % del ancho de la foto (0..45). */
  margin: number
}

export const WATERMARK_DEFAULTS: WatermarkConfig = {
  enabled: false,
  mode: "text",
  text: null,
  imageKey: null,
  position: "bottom-right",
  opacity: 0.5,
  scale: 25,
  rotation: 0,
  margin: 4,
}

/** Normaliza cualquier origen (fila de galería o jsonb del estudio) a config. */
function normalize(raw: Record<string, unknown>): WatermarkConfig {
  const num = (v: unknown, fallback: number, lo: number, hi: number) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return fallback
    return Math.min(hi, Math.max(lo, n))
  }
  return {
    enabled: Boolean(raw.enabled ?? false),
    mode: (raw.mode as WatermarkConfig["mode"]) ?? "text",
    text: (raw.text as string | null) ?? null,
    imageKey: (raw.imageKey as string | null) ?? null,
    position: (raw.position as WatermarkPosition) ?? "bottom-right",
    opacity: num(raw.opacity, 0.5, 0.02, 1),
    scale: num(raw.scale, 25, 3, 100),
    rotation: num(raw.rotation, 0, -180, 180),
    margin: num(raw.margin, 4, 0, 45),
  }
}

/** Config del estudio (la que heredan las galerías de selección). */
export async function getStudioWatermarkDefaults(
  studioId: string,
): Promise<WatermarkConfig> {
  // untyped: `studio_branding` y las columnas nuevas no están en los tipos
  // generados de Supabase.
  const supabase = untypedService()
  const { data } = await supabase
    .from("studio_branding")
    .select("watermark_defaults")
    .eq("studio_id", studioId)
    .maybeSingle()
  const raw = ((data as { watermark_defaults?: Record<string, unknown> } | null)
    ?.watermark_defaults ?? {}) as Record<string, unknown>
  return normalize(raw)
}

/**
 * Config efectiva de una galería. Devuelve null cuando NO se debe marcar
 * (entrega final, o marca desactivada).
 */
export async function getWatermarkConfig(
  galleryId: string,
): Promise<WatermarkConfig | null> {
  const supabase = untypedService()
  const { data } = await supabase
    .from("galleries")
    .select(
      "studio_id, gallery_type, watermark_use_studio_default, watermark_enabled, " +
        "watermark_mode, watermark_text, watermark_image_key, watermark_position, " +
        "watermark_opacity, watermark_scale, watermark_rotation, watermark_margin",
    )
    .eq("id", galleryId)
    .maybeSingle()
  if (!data) return null

  const row = data as Record<string, unknown>

  // Las fotos de entrega son del cliente: nunca llevan marca.
  if (row.gallery_type === "final_delivery") return null

  const cfg = row.watermark_use_studio_default
    ? await getStudioWatermarkDefaults(String(row.studio_id))
    : normalize({
        enabled: row.watermark_enabled,
        mode: row.watermark_mode,
        text: row.watermark_text,
        imageKey: row.watermark_image_key,
        position: row.watermark_position,
        opacity: row.watermark_opacity,
        scale: row.watermark_scale,
        rotation: row.watermark_rotation,
        margin: row.watermark_margin,
      })

  return cfg.enabled ? cfg : null
}

/**
 * Marca de agua de texto. Se dibuja grande y luego se reduce al tamaño pedido,
 * así el resultado se ve nítido en cualquier escala.
 */
function buildTextWatermarkSvg(text: string): Buffer {
  const safe = text.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  )
  const fontSize = 160
  const padding = fontSize * 0.35
  const charPx = fontSize * 0.58
  const width = Math.ceil(safe.length * charPx + padding * 2)
  const height = Math.ceil(fontSize * 1.35 + padding * 2)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <style>
    .wm {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-weight: 600;
      font-size: ${fontSize}px;
      fill: white;
      paint-order: stroke;
      stroke: rgba(0,0,0,0.35);
      stroke-width: ${Math.max(1, fontSize / 18)}px;
      stroke-linejoin: round;
    }
  </style>
  <text class="wm" x="${padding}" y="${fontSize + padding}">${safe}</text>
</svg>`

  return Buffer.from(svg)
}

/** Carga el logo del estudio desde el almacén. */
async function readWatermarkImage(imageKey: string): Promise<Buffer | null> {
  if (isLocalStorage()) {
    try {
      return await localRead(WATERMARKS_BUCKET, imageKey)
    } catch {
      return null
    }
  }
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase.storage
    .from(WATERMARKS_BUCKET)
    .download(imageKey)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

/**
 * Construye la marca lista para pegar: al tamaño pedido, con su transparencia
 * y ya girada.
 */
async function buildOverlay(
  config: WatermarkConfig,
  baseWidth: number,
): Promise<Buffer | null> {
  const targetWidth = Math.max(
    16,
    Math.round((baseWidth * config.scale) / 100),
  )

  let raw: Buffer | null = null
  if (config.mode === "text" && config.text?.trim()) {
    raw = buildTextWatermarkSvg(config.text.trim())
  } else if (config.mode === "image" && config.imageKey) {
    raw = await readWatermarkImage(config.imageKey)
  }
  if (!raw) return null

  // Tamaño + transparencia. El `dest-in` multiplica el canal alfa, así que la
  // opacidad se aplica pareja a todo el dibujo.
  let overlay = await sharp(raw)
    .resize({ width: targetWidth, withoutEnlargement: false })
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from([255, 255, 255, Math.round(255 * config.opacity)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer()

  if (config.rotation % 360 !== 0) {
    overlay = await sharp(overlay)
      .rotate(config.rotation, {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()
  }

  return overlay
}

/** Esquina/centro → coordenadas exactas, respetando el margen. */
function anchorFor(
  position: WatermarkPosition,
  baseW: number,
  baseH: number,
  ow: number,
  oh: number,
  marginPx: number,
): { left: number; top: number } {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v))

  let left: number
  if (position.endsWith("-left")) left = marginPx
  else if (position.endsWith("-right")) left = baseW - ow - marginPx
  else left = Math.round((baseW - ow) / 2) // center / top-center / bottom-center

  let top: number
  if (position.startsWith("top-")) top = marginPx
  else if (position.startsWith("bottom-")) top = baseH - oh - marginPx
  else top = Math.round((baseH - oh) / 2) // center / middle-*

  return { left: clamp(left, Math.max(0, baseW - ow)), top: clamp(top, Math.max(0, baseH - oh)) }
}

/**
 * Aplica la marca de agua a una imagen ya procesada (thumb o web).
 * Devuelve el buffer nuevo; ante cualquier problema devuelve el original
 * (nunca se pierde la foto por culpa de la marca).
 */
export async function applyWatermark(
  baseBuffer: Buffer,
  config: WatermarkConfig,
  opts: { quality?: number } = {},
): Promise<Buffer> {
  if (!config.enabled || !config.mode) return baseBuffer

  try {
    const meta = await sharp(baseBuffer).metadata()
    const baseWidth = meta.width ?? 1600
    const baseHeight = meta.height ?? 1066
    const quality = opts.quality ?? 82

    const overlay = await buildOverlay(config, baseWidth)
    if (!overlay) return baseBuffer

    const om = await sharp(overlay).metadata()
    const ow = om.width ?? 100
    const oh = om.height ?? 100
    const marginPx = Math.round((baseWidth * config.margin) / 100)

    // Mosaico: se repite por toda la foto, pero DEJANDO LIBRE EL CENTRO.
    //
    // El centro de la foto es donde casi siempre está la cara, así que una
    // marca justo ahí arruina la vista. En vez de borrar esa marca (dejaría un
    // hueco raro), se corre toda la rejilla en vertical para que el centro
    // exacto caiga en el ESPACIO entre dos filas: las marcas quedan un poco
    // más arriba y un poco más abajo, y la cara respira.
    if (config.position === "tile") {
      const stepX = ow + Math.max(24, marginPx * 2)
      const stepY = oh + Math.max(24, marginPx * 2)

      // Fase vertical: y0 tal que el centro quede a mitad de camino entre las
      // filas de arriba y de abajo. Queda dentro de [0, stepY) para no perder
      // cobertura por el borde superior.
      const centroY = baseHeight / 2
      const y0 =
        (((centroY - oh / 2 - stepY / 2) % stepY) + stepY) % stepY

      const composites: OverlayOptions[] = []
      for (let y = Math.round(y0); y < baseHeight; y += stepY) {
        for (let x = Math.round(marginPx / 2); x < baseWidth; x += stepX) {
          composites.push({ input: overlay, top: y, left: x })
        }
      }
      if (composites.length === 0) return baseBuffer
      return await sharp(baseBuffer)
        .composite(composites)
        .webp({ quality })
        .toBuffer()
    }

    // Si la marca es más grande que la foto, sharp rechaza el composite.
    if (ow > baseWidth || oh > baseHeight) {
      const shrunk = await sharp(overlay)
        .resize({
          width: Math.min(ow, baseWidth),
          height: Math.min(oh, baseHeight),
          fit: "inside",
        })
        .png()
        .toBuffer()
      const sm = await sharp(shrunk).metadata()
      const pos = anchorFor(
        config.position,
        baseWidth,
        baseHeight,
        sm.width ?? ow,
        sm.height ?? oh,
        marginPx,
      )
      return await sharp(baseBuffer)
        .composite([{ input: shrunk, top: pos.top, left: pos.left }])
        .webp({ quality })
        .toBuffer()
    }

    const pos = anchorFor(config.position, baseWidth, baseHeight, ow, oh, marginPx)
    return await sharp(baseBuffer)
      .composite([{ input: overlay, top: pos.top, left: pos.left }])
      .webp({ quality })
      .toBuffer()
  } catch (err) {
    console.error("[applyWatermark] falló; se deja la foto sin marca", err)
    return baseBuffer
  }
}

/**
 * Marca todos los assets de la galería para reproceso (status='pending').
 * Se usa solo cuando hace falta regenerar desde el ORIGINAL; para cambiar la
 * marca alcanza con `rebuildGalleryWatermarks`, que es mucho más liviano.
 */
export async function markGalleryForReprocessing(
  studioId: string,
  galleryId: string,
): Promise<{ count: number }> {
  const supabase = createSupabaseServiceClient()
  const { data, error, count } = await supabase
    .from("gallery_assets")
    .update({ status: "pending" }, { count: "exact" })
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
    .select("id")
  if (error) throw error
  return { count: count ?? data?.length ?? 0 }
}
