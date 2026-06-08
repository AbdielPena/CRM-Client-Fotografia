/**
 * Lógica pura de entregables impresos (planes). Vive aquí (no en el servicio
 * server-only) para que componentes de cliente la reusen.
 */

export type PrintSelectionType = "album_cover" | "frame" | "print"

export interface SizedQty {
  size: string
  qty: number
}

export interface PrintEntitlements {
  enabled: boolean
  /** Impresiones por tamaño: {"5x7":30,...} (tamaños arbitrarios). */
  prints: Record<string, number>
  /** Marcos: [{size:"12x18",qty:1}] — tamaños definidos por el estudio. */
  frames: SizedQty[]
  albums: number
  album_size: string | null
  covers: number
}

export const EMPTY_ENTITLEMENTS: PrintEntitlements = {
  enabled: false,
  prints: {},
  frames: [],
  albums: 0,
  album_size: null,
  covers: 0,
}

/** Tamaños de impresión sugeridos (editables por plan). */
export const DEFAULT_PRINT_SIZES = ["5x7", "6x8", "8x10", "11x14"] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeEntitlements(raw: any): PrintEntitlements {
  const e = (raw ?? {}) as Record<string, unknown>
  const printsRaw = (e.prints ?? {}) as Record<string, unknown>
  const prints: Record<string, number> = {}
  for (const [k, v] of Object.entries(printsRaw)) {
    const n = Number(v)
    if (k && Number.isFinite(n) && n > 0) prints[k] = Math.floor(n)
  }
  const frames: SizedQty[] = Array.isArray(e.frames)
    ? (e.frames as unknown[])
        .map((f) => {
          const o = (f ?? {}) as Record<string, unknown>
          return { size: String(o.size ?? "").trim(), qty: Math.floor(Number(o.qty) || 0) }
        })
        .filter((f) => f.size && f.qty > 0)
    : []
  return {
    enabled: !!e.enabled,
    prints,
    frames,
    albums: Math.floor(Number(e.albums) || 0),
    album_size: e.album_size ? String(e.album_size) : null,
    covers: Math.floor(Number(e.covers) || 0),
  }
}

/** ¿Tiene el plan algún entregable impreso configurado? */
export function hasPrintEntitlements(e: PrintEntitlements): boolean {
  return (
    e.covers > 0 ||
    e.frames.some((f) => f.qty > 0) ||
    Object.values(e.prints).some((q) => q > 0)
  )
}

/** Cantidad permitida para un (tipo, tamaño) dado. */
export function allowedFor(
  e: PrintEntitlements,
  type: PrintSelectionType,
  spec: string | null,
): number {
  if (type === "album_cover") return e.covers
  if (type === "frame") return e.frames.find((f) => f.size === spec)?.qty ?? 0
  if (type === "print") return spec ? (e.prints[spec] ?? 0) : 0
  return 0
}

export function catLabel(type: PrintSelectionType, spec: string | null): string {
  if (type === "album_cover") return "Portada de álbum"
  if (type === "frame") return `Marco ${spec}`
  return `Impresión ${spec}`
}
