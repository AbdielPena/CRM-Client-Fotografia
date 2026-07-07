import type { CSSProperties } from "react"

/**
 * Modelo de PÁGINAS del Luxury Book (Fase 1 — diseño de álbum).
 * Aditivo: se guarda en `galleries.book_settings.pages` (jsonb existente, sin
 * migración). El libro usa este diseño si existe; si no, auto-genera 1 foto/pág
 * como hasta ahora (retrocompatible).
 */

export type BookPageLayout = "single" | "full" | "duo" | "trio" | "collage" | "magazine"

export type BookPage = {
  id: string
  layout: BookPageLayout
  /** ids de assets (fotos de entrega) en orden. */
  assetIds: string[]
}

export const BOOK_LAYOUTS: {
  id: BookPageLayout
  label: string
  capacity: number
}[] = [
  { id: "single", label: "1 foto", capacity: 1 },
  { id: "full", label: "Página completa", capacity: 1 },
  { id: "duo", label: "2 fotos", capacity: 2 },
  { id: "magazine", label: "Revista", capacity: 2 },
  { id: "trio", label: "3 fotos", capacity: 3 },
  { id: "collage", label: "Collage", capacity: 4 },
]

export function layoutCapacity(layout: BookPageLayout): number {
  return BOOK_LAYOUTS.find((l) => l.id === layout)?.capacity ?? 1
}

export function layoutLabel(layout: BookPageLayout): string {
  return BOOK_LAYOUTS.find((l) => l.id === layout)?.label ?? layout
}

/** CSS grid del contenedor de fotos para un layout (mismo cálculo en editor y libro). */
export function layoutGridStyle(layout: BookPageLayout): CSSProperties {
  switch (layout) {
    case "duo":
      return { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr" }
    case "magazine":
      return { gridTemplateColumns: "1.6fr 1fr", gridTemplateRows: "1fr" }
    case "trio":
      return { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1.35fr 1fr" }
    case "collage":
      return { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }
    case "full":
    case "single":
    default:
      return { gridTemplateColumns: "1fr", gridTemplateRows: "1fr" }
  }
}

/** Estilo por celda (p.ej. en "trio" la 1ra foto ocupa las 2 columnas de arriba). */
export function layoutItemStyle(layout: BookPageLayout, index: number): CSSProperties {
  if (layout === "trio" && index === 0) return { gridColumn: "1 / -1" }
  return {}
}

/** Genera un id de página estable-ish sin depender de Date.now/random en el server. */
export function newPageId(seed: string | number): string {
  return `pg_${seed}_${String(seed).length}${String(seed).slice(-4)}`
}

/** Normaliza/valida lo que venga de la BD a BookPage[] (defensivo). */
export function parseBookPages(raw: unknown): BookPage[] {
  if (!Array.isArray(raw)) return []
  const valid = new Set<BookPageLayout>(BOOK_LAYOUTS.map((l) => l.id))
  const out: BookPage[] = []
  for (const p of raw) {
    if (!p || typeof p !== "object") continue
    const o = p as Record<string, unknown>
    const layout = (typeof o.layout === "string" && valid.has(o.layout as BookPageLayout)
      ? o.layout
      : "single") as BookPageLayout
    const assetIds = Array.isArray(o.assetIds)
      ? o.assetIds.filter((x): x is string => typeof x === "string").slice(0, layoutCapacity(layout))
      : []
    const id = typeof o.id === "string" && o.id ? o.id : `pg_${out.length}`
    out.push({ id, layout, assetIds })
  }
  return out
}
