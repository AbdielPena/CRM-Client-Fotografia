import type { CSSProperties } from "react"

/**
 * Portada PREMIUM del Luxury Book (Fase 2). Config aditiva en
 * `galleries.book_settings.cover` (jsonb, sin migración). El nombre/subtítulo/
 * fecha/logo/imagen/color siguen en book_settings; aquí van los ESTILOS.
 */

export type CoverModel =
  | "editorial"
  | "fine_art"
  | "minimal"
  | "royal"
  | "princess"
  | "elegant"
  | "modern"
  | "classic"
  | "floral"
  | "fashion"

export type CoverFont =
  | "cormorant"
  | "playfair"
  | "bodoni"
  | "garamond"
  | "italiana"
  | "tenor"
  | "montserrat"
  | "josefin"
  | "pinyon"
  | "greatvibes"

export type NameStyle =
  | "gold"
  | "foil"
  | "white"
  | "engraved"
  | "embossed"
  | "shadow"
  | "spaced"
  | "editorial"
  | "script"

export type TextPosition = "top" | "center" | "bottom"

export type CoverConfig = {
  model?: CoverModel
  font?: CoverFont
  nameStyle?: NameStyle
  textPosition?: TextPosition
  textScale?: number // 0.7 – 1.6
  letterSpacing?: number // em extra, 0 – 0.4
  margin?: number // % del marco interior, 3 – 20
  overlay?: number // oscurecido sobre la foto, 0 – 0.85
  shadow?: boolean // sombra suave general del bloque de texto
  phrase?: string // frase personalizada (bajo el nombre)
}

// ── Catálogos (para el editor) ───────────────────────────────────────────────
export const COVER_MODELS: { id: CoverModel; label: string }[] = [
  { id: "editorial", label: "Luxury Editorial" },
  { id: "fine_art", label: "Fine Art" },
  { id: "minimal", label: "Minimal" },
  { id: "royal", label: "Royal" },
  { id: "princess", label: "Princess" },
  { id: "elegant", label: "Elegant" },
  { id: "modern", label: "Modern" },
  { id: "classic", label: "Classic" },
  { id: "floral", label: "Floral" },
  { id: "fashion", label: "Fashion Magazine" },
]

export const COVER_FONTS: { id: CoverFont; label: string; family: string }[] = [
  { id: "cormorant", label: "Cormorant", family: "'Cormorant Garamond', Georgia, serif" },
  { id: "playfair", label: "Playfair", family: "'Playfair Display', Georgia, serif" },
  { id: "bodoni", label: "Bodoni", family: "'Bodoni Moda', Georgia, serif" },
  { id: "garamond", label: "EB Garamond", family: "'EB Garamond', Georgia, serif" },
  { id: "italiana", label: "Italiana", family: "'Italiana', Georgia, serif" },
  { id: "tenor", label: "Tenor Sans", family: "'Tenor Sans', system-ui, sans-serif" },
  { id: "montserrat", label: "Montserrat", family: "'Montserrat', system-ui, sans-serif" },
  { id: "josefin", label: "Josefin Sans", family: "'Josefin Sans', system-ui, sans-serif" },
  { id: "pinyon", label: "Pinyon (caligráfica)", family: "'Pinyon Script', cursive" },
  { id: "greatvibes", label: "Great Vibes (script)", family: "'Great Vibes', cursive" },
]

export const NAME_STYLES: { id: NameStyle; label: string }[] = [
  { id: "gold", label: "Dorado metálico" },
  { id: "foil", label: "Foil brillante" },
  { id: "white", label: "Blanco elegante" },
  { id: "engraved", label: "Grabado" },
  { id: "embossed", label: "Relieve" },
  { id: "shadow", label: "Sombra suave" },
  { id: "spaced", label: "Letras espaciadas" },
  { id: "editorial", label: "Editorial" },
  { id: "script", label: "Manuscrito" },
]

/** Familia CSS de una tipografía de portada. */
export function coverFontFamily(font: CoverFont | undefined): string {
  return COVER_FONTS.find((f) => f.id === font)?.family ?? COVER_FONTS[0]!.family
}

/** URL única de Google Fonts con TODAS las tipografías premium de la portada. */
export const COVER_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500",
    "family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500",
    "family=Bodoni+Moda:ital,wght@0,400;0,500;1,400",
    "family=EB+Garamond:ital@0;1",
    "family=Italiana",
    "family=Tenor+Sans",
    "family=Montserrat:wght@300;400;500;600",
    "family=Josefin+Sans:wght@300;400;500",
    "family=Pinyon+Script",
    "family=Great+Vibes",
  ].join("&") +
  "&display=swap"

const GOLD_GRAD = "linear-gradient(180deg,#fff3d4,#e7c884 42%,#b89968 78%)"

/** Estilo CSS del NOMBRE según el estilo elegido (color, sombra, relieve, foil…). */
export function nameStyleCss(style: NameStyle | undefined, accent: string): CSSProperties {
  switch (style) {
    case "foil":
      return {
        background: "linear-gradient(180deg,#fffaf0,#ffe9b0 40%,#d9b877 80%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        textShadow: "0 1px 0 rgba(0,0,0,.30)",
      }
    case "white":
      return { color: "#fdf8ef", textShadow: "0 2px 14px rgba(0,0,0,.5)" }
    case "engraved":
      return {
        color: "rgba(240,230,214,.72)",
        textShadow: "0 1px 0 rgba(255,255,255,.16), 0 -1px 1px rgba(0,0,0,.62)",
      }
    case "embossed":
      return {
        color: "#ecdfc7",
        textShadow: "0 1px 0 rgba(255,255,255,.38), 0 2px 3px rgba(0,0,0,.55)",
      }
    case "shadow":
      return { color: "#ffffff", textShadow: "0 8px 24px rgba(0,0,0,.6)" }
    case "spaced":
      return { color: "#f4ead6", letterSpacing: "0.3em", fontWeight: 300 }
    case "editorial":
      return {
        color: "#f7f0e4",
        textTransform: "uppercase",
        fontWeight: 400,
        letterSpacing: "0.16em",
      }
    case "script":
      return { color: accent, fontFamily: "'Great Vibes', 'Pinyon Script', cursive" }
    case "gold":
    default:
      return {
        background: GOLD_GRAD,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        textShadow: "0 1px 0 rgba(0,0,0,.35)",
      }
  }
}

/** Defaults de cada MODELO (el usuario puede sobreescribir campo por campo). */
const MODEL_DEFAULTS: Record<CoverModel, CoverConfig> = {
  editorial: { font: "bodoni", nameStyle: "editorial", textPosition: "bottom", textScale: 1, letterSpacing: 0.02, margin: 9, overlay: 0.45, shadow: true },
  fine_art: { font: "cormorant", nameStyle: "white", textPosition: "center", textScale: 1, letterSpacing: 0.04, margin: 14, overlay: 0.3, shadow: false },
  minimal: { font: "montserrat", nameStyle: "spaced", textPosition: "center", textScale: 0.9, letterSpacing: 0.12, margin: 16, overlay: 0.28, shadow: false },
  royal: { font: "playfair", nameStyle: "gold", textPosition: "center", textScale: 1.1, letterSpacing: 0.02, margin: 8, overlay: 0.5, shadow: true },
  princess: { font: "greatvibes", nameStyle: "foil", textPosition: "center", textScale: 1.2, letterSpacing: 0, margin: 10, overlay: 0.42, shadow: true },
  elegant: { font: "cormorant", nameStyle: "gold", textPosition: "bottom", textScale: 1, letterSpacing: 0.03, margin: 10, overlay: 0.45, shadow: true },
  modern: { font: "josefin", nameStyle: "white", textPosition: "bottom", textScale: 1, letterSpacing: 0.06, margin: 9, overlay: 0.35, shadow: true },
  classic: { font: "garamond", nameStyle: "gold", textPosition: "center", textScale: 1, letterSpacing: 0.03, margin: 10, overlay: 0.5, shadow: true },
  floral: { font: "cormorant", nameStyle: "white", textPosition: "bottom", textScale: 1, letterSpacing: 0.04, margin: 11, overlay: 0.4, shadow: true },
  fashion: { font: "bodoni", nameStyle: "editorial", textPosition: "top", textScale: 1.05, letterSpacing: 0.1, margin: 8, overlay: 0.4, shadow: true },
}

export const DEFAULT_COVER: Required<Omit<CoverConfig, "phrase">> & { phrase: string } = {
  model: "elegant",
  font: "cormorant",
  nameStyle: "gold",
  textPosition: "center",
  textScale: 1,
  letterSpacing: 0.03,
  margin: 10,
  overlay: 0.45,
  shadow: true,
  phrase: "",
}

/** Combina defaults del modelo + overrides del usuario → config completa. */
export function resolveCover(raw: unknown): Required<Omit<CoverConfig, "phrase">> & { phrase: string } {
  const c = (raw && typeof raw === "object" ? raw : {}) as CoverConfig
  const base = c.model && MODEL_DEFAULTS[c.model] ? MODEL_DEFAULTS[c.model] : {}
  const merged = { ...DEFAULT_COVER, ...base, ...clean(c) }
  return {
    model: merged.model ?? "elegant",
    font: merged.font ?? "cormorant",
    nameStyle: merged.nameStyle ?? "gold",
    textPosition: merged.textPosition ?? "center",
    textScale: clamp(merged.textScale ?? 1, 0.7, 1.6),
    letterSpacing: clamp(merged.letterSpacing ?? 0.03, 0, 0.4),
    margin: clamp(merged.margin ?? 10, 3, 20),
    overlay: clamp(merged.overlay ?? 0.45, 0, 0.85),
    shadow: merged.shadow ?? true,
    phrase: typeof merged.phrase === "string" ? merged.phrase : "",
  }
}

/** Aplica un modelo a una config existente (resetea a los defaults del modelo). */
export function applyModel(model: CoverModel): CoverConfig {
  return { model, ...MODEL_DEFAULTS[model] }
}

// Solo deja pasar claves definidas (para el merge de overrides).
function clean(c: CoverConfig): CoverConfig {
  const o: CoverConfig = {}
  for (const [k, v] of Object.entries(c)) {
    if (v !== undefined && v !== null) (o as Record<string, unknown>)[k] = v
  }
  return o
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo))
}
