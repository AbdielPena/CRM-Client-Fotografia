"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { X, ChevronLeft, ChevronRight, BookOpen } from "lucide-react"

// StPageFlip es DOM-pesado y solo cliente → carga diferida sin SSR.
const HTMLFlipBook = dynamic(() => import("react-pageflip"), {
  ssr: false,
}) as unknown as React.ComponentType<
  Record<string, unknown> & { children?: React.ReactNode }
>

export type BookAsset = {
  id: string
  webUrl: string | null
  thumbUrl: string | null
  width?: number | null
  height?: number | null
}

export type BookGallery = {
  name: string
  accentColor?: string | null
  coverWebUrl?: string | null
  bookTemplateId?: string | null
  bookCoverImage?: string | null
  bookSettings?: Record<string, unknown>
}

export type BookStudio = {
  name: string
  logoUrl?: string | null
  hideBranding?: boolean
}

type Template = {
  bg: string
  pageBg: string
  ink: string
  accent: string
  serif: string
}

// Presets — configurables por book_settings encima.
const TEMPLATES: Record<string, Template> = {
  luxury_xv: {
    bg: "#14110f",
    pageBg: "#fbf6ed",
    ink: "#1a1614",
    accent: "#b89968",
    serif: "'EB Garamond', Georgia, serif",
  },
  luxury_wedding: {
    bg: "#1c1a17",
    pageBg: "#f6f1ea",
    ink: "#2a251f",
    accent: "#a98f6f",
    serif: "'EB Garamond', Georgia, serif",
  },
}

function s(v: unknown): string {
  return typeof v === "string" ? v : ""
}

export function FinalDeliveryBook({
  gallery,
  assets,
  studio,
  onClose,
}: {
  gallery: BookGallery
  assets: BookAsset[]
  studio: BookStudio
  onClose?: () => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<{ pageFlip?: () => { flipNext: () => void; flipPrev: () => void } }>(null)
  const [page, setPage] = useState(0)
  const [ready, setReady] = useState(false)
  const [dims, setDims] = useState({ w: 480, h: 640 })

  const settings = gallery.bookSettings ?? {}
  const tpl =
    TEMPLATES[gallery.bookTemplateId ?? "luxury_xv"] ?? TEMPLATES.luxury_xv!
  const accent = s(settings.accent) || gallery.accentColor || tpl.accent
  const pageBg = s(settings.bgColor) || tpl.pageBg
  const photos = useMemo(
    () => assets.filter((a) => a.webUrl || a.thumbUrl),
    [assets],
  )
  const coverImg =
    gallery.bookCoverImage || gallery.coverWebUrl || photos[0]?.webUrl || null

  const title = s(settings.title) || gallery.name
  const quince = s(settings.quinceaneraName)
  const subtitle = s(settings.subtitle)
  const eventDate = s(settings.eventDate)
  const showLogo = settings.showLogo !== false && !!studio.logoUrl

  // Tamaño responsive del libro (proporción retrato 3:4).
  useEffect(() => {
    function measure() {
      const el = wrapRef.current
      if (!el) return
      const availW = el.clientWidth
      const availH = el.clientHeight
      const portrait = availW < 820
      // En desktop el flipbook muestra doble página → cada hoja = mitad.
      const maxW = portrait ? Math.min(availW - 32, 560) : Math.min((availW - 48) / 2, 520)
      let w = maxW
      let h = w * (4 / 3)
      const cap = availH - (portrait ? 150 : 120)
      if (h > cap) {
        h = cap
        w = h * (3 / 4)
      }
      setDims({ w: Math.max(260, Math.round(w)), h: Math.max(340, Math.round(h)) })
      setReady(true)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  // Cerrar con Escape en modo overlay.
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  function flip(dir: -1 | 1) {
    const api = bookRef.current?.pageFlip?.()
    if (!api) return
    if (dir === 1) api.flipNext()
    else api.flipPrev()
  }

  // Página de portada (tapa dura).
  const totalPages = photos.length + 2

  return (
    <div
      ref={wrapRef}
      className="abby-book"
      style={{
        position: "relative",
        width: "100%",
        height: onClose ? "100vh" : "100svh",
        minHeight: onClose ? "100vh" : "640px",
        background: `radial-gradient(120% 120% at 50% 0%, ${tpl.bg} 0%, #0b0a09 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          zIndex: 10,
          color: "#efe6dc",
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            opacity: 0.7,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {studio.name}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Cerrar álbum"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,.1)",
              color: "#efe6dc",
              border: "1px solid rgba(255,255,255,.18)",
              borderRadius: 999,
              padding: "7px 14px",
              fontSize: 13,
              cursor: "pointer",
              backdropFilter: "blur(6px)",
            }}
          >
            <X size={15} /> Cerrar
          </button>
        )}
      </div>

      {!ready ? (
        <div style={{ color: "#b89968", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <BookOpen size={28} className="animate-pulse" />
          <span style={{ fontSize: 13, letterSpacing: "0.1em" }}>Preparando tu álbum…</span>
        </div>
      ) : (
        <HTMLFlipBook
          ref={bookRef}
          width={dims.w}
          height={dims.h}
          size="stretch"
          minWidth={260}
          maxWidth={620}
          minHeight={340}
          maxHeight={920}
          maxShadowOpacity={0.5}
          showCover={true}
          mobileScrollSupport={true}
          drawShadow={true}
          flippingTime={750}
          usePortrait={true}
          startPage={0}
          className="abby-flipbook"
          style={{}}
          onFlip={(e: { data: number }) => setPage(e.data)}
        >
          {/* PORTADA (tapa dura) */}
          <div data-density="hard" style={coverStyle(coverImg, tpl, accent)}>
            <div style={coverScrim} />
            <div style={{ position: "relative", textAlign: "center", padding: 28, color: "#fff" }}>
              {showLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={studio.logoUrl!} alt={studio.name} style={{ height: 38, objectFit: "contain", margin: "0 auto 18px", filter: "brightness(0) invert(1)", opacity: 0.95 }} />
              )}
              <p style={{ fontSize: 11, letterSpacing: "0.32em", textTransform: "uppercase", opacity: 0.85, margin: "0 0 14px" }}>
                {subtitle || "Álbum de entrega"}
              </p>
              <h1 style={{ fontFamily: tpl.serif, fontStyle: "italic", fontWeight: 500, fontSize: "clamp(28px,6vw,44px)", lineHeight: 1.05, margin: 0 }}>
                {quince || title}
              </h1>
              {eventDate && (
                <p style={{ marginTop: 16, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.9 }}>
                  {eventDate}
                </p>
              )}
              <div style={{ width: 44, height: 1, background: accent, margin: "20px auto 0", opacity: 0.9 }} />
            </div>
          </div>

          {/* PÁGINAS DE FOTOS */}
          {photos.map((a, i) => (
            <div key={a.id} style={photoPageStyle(pageBg)}>
              <div style={{ position: "relative", width: "100%", height: "100%", padding: "5%", boxSizing: "border-box" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.webUrl ?? a.thumbUrl ?? ""}
                  alt={`${gallery.name} — foto ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", boxShadow: "0 8px 30px -12px rgba(0,0,0,.45)" }}
                />
                <span style={{ position: "absolute", bottom: 10, right: 16, fontSize: 10, color: tpl.ink, opacity: 0.4, fontFamily: "system-ui, sans-serif" }}>
                  {i + 1}
                </span>
              </div>
            </div>
          ))}

          {/* CONTRAPORTADA (tapa dura) */}
          <div data-density="hard" style={{ ...coverStyleSolid(tpl), display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", color: "#efe6dc", padding: 28 }}>
              {showLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={studio.logoUrl!} alt={studio.name} style={{ height: 34, objectFit: "contain", margin: "0 auto 16px", filter: "brightness(0) invert(1)", opacity: 0.9 }} />
              )}
              <p style={{ fontFamily: tpl.serif, fontStyle: "italic", fontSize: 22, margin: 0 }}>Gracias.</p>
              {!studio.hideBranding && (
                <p style={{ marginTop: 18, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.5 }}>
                  {studio.name}
                </p>
              )}
            </div>
          </div>
        </HTMLFlipBook>
      )}

      {/* Controles inferiores */}
      {ready && (
        <div
          style={{
            position: "absolute",
            bottom: 18,
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
            zIndex: 10,
          }}
        >
          <button onClick={() => flip(-1)} aria-label="Página anterior" style={navBtn}>
            <ChevronLeft size={20} />
          </button>
          <span style={{ color: "#efe6dc", fontSize: 12, letterSpacing: "0.1em", minWidth: 64, textAlign: "center", opacity: 0.85 }}>
            {Math.min(page + 1, totalPages)} / {totalPages}
          </span>
          <button onClick={() => flip(1)} aria-label="Página siguiente" style={navBtn}>
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Botón flotante + overlay para el modo "ambos" (galería clásica + libro). */
export function BookLauncher(props: {
  gallery: BookGallery
  assets: BookAsset[]
  studio: BookStudio
}) {
  const [open, setOpen] = useState(false)
  const accent = props.gallery.accentColor || "#b89968"
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 40,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: accent,
          color: "#14110f",
          border: "none",
          borderRadius: 999,
          padding: "13px 22px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 14px 36px -12px rgba(0,0,0,.5)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <BookOpen size={17} /> Abrir Luxury Book
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
          <FinalDeliveryBook {...props} onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  )
}

// ── estilos helper ───────────────────────────────────────────────────────────
const navBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 42,
  height: 42,
  borderRadius: 999,
  background: "rgba(255,255,255,.1)",
  color: "#efe6dc",
  border: "1px solid rgba(255,255,255,.18)",
  cursor: "pointer",
  backdropFilter: "blur(6px)",
}
const coverScrim: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,.55) 100%)",
}
function coverStyle(img: string | null, tpl: Template, accent: string): React.CSSProperties {
  return {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: img
      ? `#000 url(${img}) center/cover no-repeat`
      : `linear-gradient(135deg, ${tpl.bg}, #000)`,
    boxShadow: `inset 0 0 0 1px ${accent}33`,
    position: "relative",
  }
}
function coverStyleSolid(tpl: Template): React.CSSProperties {
  return {
    width: "100%",
    height: "100%",
    background: `linear-gradient(135deg, ${tpl.bg}, #0b0a09)`,
  }
}
function photoPageStyle(bg: string): React.CSSProperties {
  return { width: "100%", height: "100%", background: bg, position: "relative" }
}
