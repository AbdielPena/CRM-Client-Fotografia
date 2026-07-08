import {
  coverFontFamily,
  nameStyleCss,
  type CoverConfig,
  resolveCover,
} from "@/lib/book/cover"

/**
 * Portada del Luxury Book — presentacional y COMPARTIDA por el libro (flipbook)
 * y la vista previa del editor. Escala con `container queries` (cqw/cqh), así se
 * ve igual en cualquier tamaño de caja. No lleva hooks (sirve en server/client).
 */
export function BookCoverView({
  coverRaw,
  coverImg,
  name,
  subtitle,
  eventDate,
  logoUrl,
  showLogo,
  accent,
}: {
  coverRaw: CoverConfig | unknown
  coverImg: string | null
  name: string
  subtitle: string
  eventDate: string
  logoUrl: string | null
  showLogo: boolean
  accent: string
}) {
  const c = resolveCover(coverRaw)
  const family = coverFontFamily(c.font)
  const justify =
    c.textPosition === "top" ? "flex-start" : c.textPosition === "bottom" ? "flex-end" : "center"

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", containerType: "size" }}>
      {coverImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverImg}
          alt=""
          aria-hidden
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }}
        />
      )}
      {/* Oscurecido (configurable) para legibilidad del texto */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: `radial-gradient(120% 95% at 50% 30%, rgba(0,0,0,${c.overlay * 0.35}) 0%, rgba(0,0,0,${c.overlay * 0.55}) 60%, rgba(0,0,0,${c.overlay}) 100%)`,
        }}
      />
      {/* Marco fino dorado (interior por márgenes) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: `${c.margin}%`,
          zIndex: 2,
          border: "1px solid rgba(231,200,132,.42)",
          boxShadow: "inset 0 0 0 1px rgba(255,243,212,.10)",
        }}
      />
      {/* Bloque de texto */}
      <div
        style={{
          position: "absolute",
          inset: `${c.margin + 4}%`,
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: justify,
          textAlign: "center",
          color: "#fff",
          fontFamily: family,
          filter: c.shadow ? "drop-shadow(0 6px 18px rgba(0,0,0,.5))" : undefined,
        }}
      >
        {showLogo && logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            style={{
              height: "9cqh",
              maxHeight: "9cqh",
              objectFit: "contain",
              marginBottom: "3cqh",
              filter: "brightness(0) invert(1) drop-shadow(0 0 6px rgba(0,0,0,.4))",
              opacity: 0.92,
            }}
          />
        )}
        {subtitle && (
          <p
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: "2.3cqw",
              letterSpacing: "0.42em",
              textTransform: "uppercase",
              opacity: 0.85,
              margin: "0 0 3cqh",
              color: "#f3e8d2",
            }}
          >
            {subtitle}
          </p>
        )}
        <h1
          style={{
            margin: 0,
            fontWeight: 500,
            lineHeight: 1.02,
            fontSize: `${8.4 * c.textScale}cqw`,
            letterSpacing: `${c.letterSpacing}em`,
            ...nameStyleCss(c.nameStyle, accent),
          }}
        >
          {name}
        </h1>
        {c.phrase && (
          <p
            style={{
              fontFamily: family,
              fontStyle: "italic",
              fontSize: "3.4cqw",
              lineHeight: 1.4,
              margin: "3cqh 0 0",
              maxWidth: "80%",
              color: "#f0e6da",
            }}
          >
            {c.phrase}
          </p>
        )}
        {eventDate && (
          <p
            style={{
              fontFamily: "'EB Garamond', Georgia, serif",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontSize: "2.6cqw",
              opacity: 0.92,
              margin: "3.4cqh 0 0",
              color: "#f3e8d2",
            }}
          >
            {eventDate}
          </p>
        )}
        <div
          aria-hidden
          style={{
            width: "9cqw",
            height: "1px",
            marginTop: "3cqh",
            background: "linear-gradient(90deg,transparent,#e7c884,transparent)",
          }}
        />
      </div>
    </div>
  )
}
