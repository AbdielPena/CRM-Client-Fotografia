/**
 * Lógica pura de entregables impresos (planes). Vive aquí (no en el servicio
 * server-only) para que componentes de cliente la reusen.
 */

export type PrintSelectionType = "album_cover" | "frame" | "print"

/**
 * Modo de una impresión por tamaño:
 *  - "manual": el cliente selecciona las fotos (respetando la cantidad del plan).
 *  - "auto":   se imprimen automáticamente TODAS las fotos entregadas (sin
 *              selección del cliente; la cantidad del plan se ignora).
 */
export type PrintMode = "manual" | "auto"

export interface SizedQty {
  size: string
  qty: number
}

export interface PrintEntitlements {
  enabled: boolean
  /** Impresiones por tamaño: {"5x7":30,...} (tamaños arbitrarios). */
  prints: Record<string, number>
  /**
   * Modo por tamaño de impresión: {"5x7":"auto"}. Ausente para un tamaño = "manual".
   * Snake_case a propósito: se guarda tal cual en el jsonb (igual que album_size).
   */
  print_modes: Record<string, PrintMode>
  /** Marcos: [{size:"12x18",qty:1}] — tamaños definidos por el estudio. */
  frames: SizedQty[]
  albums: number
  album_size: string | null
  covers: number
}

export const EMPTY_ENTITLEMENTS: PrintEntitlements = {
  enabled: false,
  prints: {},
  print_modes: {},
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
  // Modo por tamaño. Acepta print_modes (nuevo) o printModes (por si acaso).
  const modesRaw = (e.print_modes ??
    (e as Record<string, unknown>).printModes ??
    {}) as Record<string, unknown>
  const print_modes: Record<string, PrintMode> = {}
  for (const [k, v] of Object.entries(modesRaw)) {
    const size = String(k).trim()
    if (size) print_modes[size] = v === "auto" ? "auto" : "manual"
  }
  // Un tamaño en modo "auto" es un entregable aunque no tenga cantidad (se
  // imprimen TODAS las entregadas). Garantizamos que exista en `prints` (qty 0)
  // para que el estado/ZIP lo consideren.
  for (const [size, mode] of Object.entries(print_modes)) {
    if (mode === "auto" && !(size in prints)) prints[size] = 0
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
    print_modes,
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
    Object.values(e.prints).some((q) => q > 0) ||
    Object.values(e.print_modes).some((m) => m === "auto")
  )
}

/** ¿Ese tamaño de impresión se imprime automáticamente (todas las entregadas)? */
export function isAutoPrint(e: PrintEntitlements, size: string | null): boolean {
  return !!size && e.print_modes[size] === "auto"
}

/**
 * Cantidad permitida para SELECCIÓN MANUAL de un (tipo, tamaño) dado.
 * Un tamaño de impresión en modo "auto" devuelve 0: no se selecciona a mano.
 */
export function allowedFor(
  e: PrintEntitlements,
  type: PrintSelectionType,
  spec: string | null,
): number {
  if (type === "album_cover") return e.covers
  if (type === "frame") return e.frames.find((f) => f.size === spec)?.qty ?? 0
  if (type === "print") {
    if (!spec) return 0
    if (e.print_modes[spec] === "auto") return 0
    return e.prints[spec] ?? 0
  }
  return 0
}

export function catLabel(type: PrintSelectionType, spec: string | null): string {
  if (type === "album_cover") return "Portada de álbum"
  if (type === "frame") return `Marco ${spec}`
  return `Impresión ${spec}`
}

/**
 * Resumen corto y legible de lo que incluye el plan en impresos, para listas
 * administrativas. Ej.: "Portada de álbum · 2 marcos 12x18 · Impresiones 5x7 (todas)".
 */
export function summarizeEntitlements(e: PrintEntitlements): string {
  const parts: string[] = []
  if (e.covers > 0) {
    parts.push(e.covers === 1 ? "Portada de álbum" : `${e.covers} portadas`)
  }
  if (e.albums > 0) {
    parts.push(
      e.album_size
        ? `Álbum ${e.album_size}`
        : e.albums === 1
          ? "Álbum"
          : `${e.albums} álbumes`,
    )
  }
  for (const f of e.frames) {
    parts.push(`${f.qty} marco${f.qty === 1 ? "" : "s"} ${f.size}`)
  }
  for (const [size, qty] of Object.entries(e.prints)) {
    if (e.print_modes[size] === "auto") {
      parts.push(`Impresiones ${size} (todas)`)
    } else if (qty > 0) {
      parts.push(`${qty} impresi${qty === 1 ? "ón" : "ones"} ${size}`)
    }
  }
  return parts.join(" · ") || "Impresiones"
}
