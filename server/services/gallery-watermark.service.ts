// ─── Watermark service ──────────────────────────────────────────────────────
// Aplica watermark (texto o imagen) a una rendition `web` usando Sharp.
// Solo afecta lo que ve el cliente — el original queda intacto en privado.

import "server-only"

import sharp, { type OverlayOptions } from "sharp"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { isLocalStorage, localRead } from "@/lib/storage/local-driver"

const WATERMARKS_BUCKET = "gallery-watermarks"

export type WatermarkConfig = {
  enabled: boolean
  mode: "text" | "image" | null
  text: string | null
  imageKey: string | null
  position: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "tile"
  opacity: number // 0..1
}

export async function getWatermarkConfig(
  galleryId: string,
): Promise<WatermarkConfig | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from("galleries")
    .select(
      "watermark_enabled, watermark_mode, watermark_text, watermark_image_key, watermark_position, watermark_opacity",
    )
    .eq("id", galleryId)
    .maybeSingle()
  if (!data || !data.watermark_enabled) return null

  return {
    enabled: data.watermark_enabled,
    mode: data.watermark_mode as WatermarkConfig["mode"],
    text: data.watermark_text,
    imageKey: data.watermark_image_key,
    position: (data.watermark_position ??
      "bottom-right") as WatermarkConfig["position"],
    opacity: Number(data.watermark_opacity ?? 0.5),
  }
}

function gravityFor(
  pos: WatermarkConfig["position"],
): "centre" | "northwest" | "northeast" | "southwest" | "southeast" {
  switch (pos) {
    case "center":
      return "centre"
    case "top-left":
      return "northwest"
    case "top-right":
      return "northeast"
    case "bottom-left":
      return "southwest"
    case "bottom-right":
      return "southeast"
    case "tile":
      return "southeast" // tile se maneja distinto, fallback a esquina
  }
}

/**
 * Genera un watermark de texto como SVG. El SVG se renderiza con Sharp y se
 * compone sobre la imagen base. Tamaño se ajusta en función del ancho base.
 */
function buildTextWatermarkSvg(
  text: string,
  baseWidth: number,
  opacity: number,
): Buffer {
  const safe = text.replace(/[<>&"']/g, (c) =>
    ({
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&apos;",
    })[c]!,
  )
  const fontSize = Math.max(20, Math.round(baseWidth * 0.04))
  const padding = fontSize * 0.6
  const charPx = fontSize * 0.55
  const width = Math.ceil(safe.length * charPx + padding * 2)
  const height = Math.ceil(fontSize + padding * 2)

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
      opacity: ${opacity};
    }
  </style>
  <text class="wm" x="${padding}" y="${fontSize + padding / 2}">${safe}</text>
</svg>`

  return Buffer.from(svg)
}

/**
 * Aplica el watermark a un buffer de imagen ya procesado (web rendition).
 * Devuelve el nuevo buffer.
 */
export async function applyWatermark(
  baseBuffer: Buffer,
  config: WatermarkConfig,
): Promise<Buffer> {
  if (!config.enabled || !config.mode) return baseBuffer

  const meta = await sharp(baseBuffer).metadata()
  const baseWidth = meta.width ?? 1600

  let overlayBuffer: Buffer
  if (config.mode === "text" && config.text) {
    overlayBuffer = buildTextWatermarkSvg(
      config.text,
      baseWidth,
      config.opacity,
    )
  } else if (config.mode === "image" && config.imageKey) {
    let raw: Buffer
    if (isLocalStorage()) {
      try {
        raw = await localRead(WATERMARKS_BUCKET, config.imageKey)
      } catch {
        return baseBuffer
      }
    } else {
      const supabase = createSupabaseServiceClient()
      const { data, error } = await supabase.storage
        .from(WATERMARKS_BUCKET)
        .download(config.imageKey)
      if (error || !data) return baseBuffer
      raw = Buffer.from(await data.arrayBuffer())
    }
    // Resize watermark a 1/4 del ancho base, con opacity
    const targetWidth = Math.round(baseWidth * 0.25)
    overlayBuffer = await sharp(raw)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .ensureAlpha()
      .composite([
        {
          input: Buffer.from([
            255,
            255,
            255,
            Math.round(255 * config.opacity),
          ]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer()
  } else {
    return baseBuffer
  }

  // Tile pattern: repetir overlay en grid sobre toda la imagen
  if (config.position === "tile") {
    const overlayMeta = await sharp(overlayBuffer).metadata()
    const ow = overlayMeta.width ?? 200
    const oh = overlayMeta.height ?? 50
    const baseHeight = meta.height ?? 1066
    const composites: OverlayOptions[] = []
    const stepX = ow + 80
    const stepY = oh + 80
    for (let y = 20; y < baseHeight; y += stepY) {
      for (let x = 20; x < baseWidth; x += stepX) {
        composites.push({ input: overlayBuffer, top: y, left: x })
      }
    }
    return sharp(baseBuffer).composite(composites).webp({ quality: 82 }).toBuffer()
  }

  // Anchor en una esquina/centro
  return sharp(baseBuffer)
    .composite([
      {
        input: overlayBuffer,
        gravity: gravityFor(config.position),
      },
    ])
    .webp({ quality: 82 })
    .toBuffer()
}

/**
 * Marca todos los assets de la galería para reproceso (status='processing').
 * Se llama cuando el studio cambia la config de watermark.
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
