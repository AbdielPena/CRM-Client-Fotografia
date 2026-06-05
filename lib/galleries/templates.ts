// ============================================================================
// Catálogo de templates premium para Galerías 2.0
// ----------------------------------------------------------------------------
// 5 presets definidos en código (look profesional garantizado) + personalización
// acotada por galería vía `galleries.theme` (jsonb) y `galleries.cover_config`.
// Módulo framework-agnóstico: lo consumen el visor público, el portal y el editor.
// ============================================================================

export type GalleryMode = "light" | "dark"
export type GalleryGrid = "masonry" | "grid" | "justified"
export type GallerySpacing = "compact" | "cozy" | "spacious"
export type GalleryCornerStyle = "sharp" | "soft"
export type GalleryCoverStyle = "full" | "split" | "framed" | "minimal"
export type GalleryFontKey = "serif-editorial" | "serif-display" | "sans-clean" | "modern-geo"
export type GalleryTextAlign = "left" | "center" | "right"

export interface GalleryTheme {
  mode: GalleryMode
  accent: string // hex
  font: GalleryFontKey
  grid: GalleryGrid
  /** columnas en desktop (móvil siempre 2) */
  columns: number
  spacing: GallerySpacing
  corner: GalleryCornerStyle
  coverStyle: GalleryCoverStyle
}

export interface CoverConfig {
  /** asset a usar como portada; si falta, cae a galleries.cover_asset_id */
  imageAssetId?: string | null
  /** url directa de portada (override) */
  imageUrl?: string | null
  /** foco de la imagen 0..1 */
  focalX?: number
  focalY?: number
  overlay?: "none" | "light" | "dark"
  /** 0..1 */
  overlayIntensity?: number
  title?: string | null
  subtitle?: string | null
  showButton?: boolean
  buttonLabel?: string | null
  textAlign?: GalleryTextAlign
  /** color del texto sobre la portada */
  textColor?: "light" | "dark"
}

export interface GalleryTemplate {
  id: string
  label: string
  description: string
  recommendedFor: "selection" | "final_delivery" | "both"
  theme: GalleryTheme
  /** color para la muestra del selector */
  swatch: string
}

// ---------------------------------------------------------------------------
// Fuentes (curadas, no libres). El visor inyecta la Google Font si aplica.
// ---------------------------------------------------------------------------
export const GALLERY_FONTS: Record<
  GalleryFontKey,
  { stack: string; google?: string }
> = {
  "serif-editorial": {
    stack: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
    google: "Cormorant+Garamond:wght@400;500;600&display=swap",
  },
  "serif-display": {
    stack: "'Playfair Display', Georgia, 'Times New Roman', serif",
    google: "Playfair+Display:wght@400;500;600;700&display=swap",
  },
  "sans-clean": {
    stack: "'Inter', system-ui, -apple-system, Segoe UI, sans-serif",
    google: "Inter:wght@300;400;500;600&display=swap",
  },
  "modern-geo": {
    stack: "'Poppins', 'Inter', system-ui, sans-serif",
    google: "Poppins:wght@300;400;500;600&display=swap",
  },
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
export const GALLERY_TEMPLATES: GalleryTemplate[] = [
  {
    id: "wedding_luxury",
    label: "Wedding Luxury",
    description: "Editorial, elegante y luminoso. Tonos suaves con acento dorado. Ideal para bodas.",
    recommendedFor: "final_delivery",
    swatch: "#B08D57",
    theme: {
      mode: "light",
      accent: "#B08D57",
      font: "serif-editorial",
      grid: "justified",
      columns: 3,
      spacing: "spacious",
      corner: "soft",
      coverStyle: "full",
    },
  },
  {
    id: "portfolio_minimal",
    label: "Portfolio Minimal",
    description: "Minimalista, mucho espacio en blanco, todo el foco en la fotografía.",
    recommendedFor: "both",
    swatch: "#111111",
    theme: {
      mode: "light",
      accent: "#111111",
      font: "sans-clean",
      grid: "grid",
      columns: 3,
      spacing: "spacious",
      corner: "sharp",
      coverStyle: "minimal",
    },
  },
  {
    id: "flat_modern",
    label: "Flat Modern Gallery",
    description: "Flat, moderno y ordenado. Rápido y profesional, cuadrícula limpia.",
    recommendedFor: "both",
    swatch: "#2563EB",
    theme: {
      mode: "light",
      accent: "#2563EB",
      font: "modern-geo",
      grid: "grid",
      columns: 4,
      spacing: "cozy",
      corner: "soft",
      coverStyle: "split",
    },
  },
  {
    id: "editorial_quince",
    label: "Editorial Quinceañera",
    description: "Dramático, artístico y mágico sobre fondo oscuro. Pensado para quinceañeras.",
    recommendedFor: "final_delivery",
    swatch: "#D9466F",
    theme: {
      mode: "dark",
      accent: "#D9466F",
      font: "serif-display",
      grid: "masonry",
      columns: 3,
      spacing: "cozy",
      corner: "soft",
      coverStyle: "full",
    },
  },
  {
    id: "classic_proofing",
    label: "Classic Client Proofing",
    description: "Sencillo y práctico. Cuadrícula densa ideal para que el cliente seleccione.",
    recommendedFor: "selection",
    swatch: "#4B5563",
    theme: {
      mode: "light",
      accent: "#4B5563",
      font: "sans-clean",
      grid: "grid",
      columns: 5,
      spacing: "compact",
      corner: "sharp",
      coverStyle: "minimal",
    },
  },
]

export const DEFAULT_TEMPLATE_ID = "classic_proofing"

export function getGalleryTemplate(id: string | null | undefined): GalleryTemplate {
  return (
    GALLERY_TEMPLATES.find((t) => t.id === id) ??
    GALLERY_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID)!
  )
}

/** Default de template según el tipo de galería. */
export function defaultTemplateForType(type: "selection" | "final_delivery"): string {
  return type === "final_delivery" ? "wedding_luxury" : "classic_proofing"
}

/**
 * Combina el preset del template con los overrides guardados por galería.
 * Sólo se respetan claves conocidas (evita inyección de propiedades arbitrarias).
 */
export function resolveGalleryTheme(
  templateId: string | null | undefined,
  overrides?: Partial<GalleryTheme> | null,
): GalleryTheme {
  const base = getGalleryTemplate(templateId).theme
  const o = (overrides ?? {}) as Partial<GalleryTheme>
  return {
    mode: o.mode === "light" || o.mode === "dark" ? o.mode : base.mode,
    accent: typeof o.accent === "string" && /^#[0-9a-fA-F]{3,8}$/.test(o.accent) ? o.accent : base.accent,
    font: o.font && GALLERY_FONTS[o.font] ? o.font : base.font,
    grid: o.grid === "masonry" || o.grid === "grid" || o.grid === "justified" ? o.grid : base.grid,
    columns: clampColumns(o.columns, base.columns),
    spacing:
      o.spacing === "compact" || o.spacing === "cozy" || o.spacing === "spacious"
        ? o.spacing
        : base.spacing,
    corner: o.corner === "sharp" || o.corner === "soft" ? o.corner : base.corner,
    coverStyle:
      o.coverStyle === "full" ||
      o.coverStyle === "split" ||
      o.coverStyle === "framed" ||
      o.coverStyle === "minimal"
        ? o.coverStyle
        : base.coverStyle,
  }
}

function clampColumns(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? Math.round(v) : NaN
  if (Number.isFinite(n)) return Math.min(6, Math.max(2, n))
  return fallback
}

// ---------------------------------------------------------------------------
// Derivar tokens visuales para el render (CSS variables)
// ---------------------------------------------------------------------------
const SPACING_PX: Record<GallerySpacing, number> = { compact: 4, cozy: 10, spacious: 18 }

export interface GalleryStyleTokens {
  bg: string
  fg: string
  muted: string
  accent: string
  fontStack: string
  googleFont?: string
  radiusPx: number
  gapPx: number
  columns: number
  mode: GalleryMode
  grid: GalleryGrid
}

export function galleryStyleTokens(theme: GalleryTheme): GalleryStyleTokens {
  const font = GALLERY_FONTS[theme.font] ?? GALLERY_FONTS["sans-clean"]
  return {
    bg: theme.mode === "dark" ? "#0b0b0d" : "#ffffff",
    fg: theme.mode === "dark" ? "#f4f4f5" : "#18181b",
    muted: theme.mode === "dark" ? "#a1a1aa" : "#71717a",
    accent: theme.accent,
    fontStack: font.stack,
    googleFont: font.google,
    radiusPx: theme.corner === "soft" ? 12 : 0,
    gapPx: SPACING_PX[theme.spacing],
    columns: theme.columns,
    mode: theme.mode,
    grid: theme.grid,
  }
}

/** CSS custom properties listas para inyectar en un contenedor del visor. */
export function galleryCssVars(theme: GalleryTheme): Record<string, string> {
  const t = galleryStyleTokens(theme)
  return {
    "--g-bg": t.bg,
    "--g-fg": t.fg,
    "--g-muted": t.muted,
    "--g-accent": t.accent,
    "--g-font": t.fontStack,
    "--g-radius": `${t.radiusPx}px`,
    "--g-gap": `${t.gapPx}px`,
    "--g-cols": String(t.columns),
  }
}

/** Normaliza/saea un cover_config jsonb arbitrario a algo seguro de renderizar. */
export function resolveCoverConfig(raw: unknown): CoverConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const num = (v: unknown, def: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  return {
    imageAssetId: str(c.imageAssetId),
    imageUrl: str(c.imageUrl),
    focalX: num(c.focalX, 0.5),
    focalY: num(c.focalY, 0.5),
    overlay: c.overlay === "light" || c.overlay === "dark" ? c.overlay : "dark",
    overlayIntensity: num(c.overlayIntensity, 0.35),
    title: str(c.title),
    subtitle: str(c.subtitle),
    showButton: c.showButton !== false,
    buttonLabel: str(c.buttonLabel),
    textAlign:
      c.textAlign === "left" || c.textAlign === "right" || c.textAlign === "center"
        ? c.textAlign
        : "center",
    textColor: c.textColor === "dark" ? "dark" : "light",
  }
}
