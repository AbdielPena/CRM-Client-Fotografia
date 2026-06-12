"use client"

import { useCallback, useMemo, useState } from "react"
import {
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Sparkles,
  Clock,
  Gem,
  Smartphone,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils/cn"

/** Paleta luxury fija — dorado champagne sobre grafito. Nunca azul. */
const GOLD = "#b89968"
const GOLD_SOFT = "#cbb083"

type Asset = {
  id: string
  width: number | null
  height: number | null
  thumbUrl: string | null
  webUrl: string | null
  lqip?: string | null
  aspect?: number | null
  deliveryTrack?: "social" | "high_quality" | null
}

type Gallery = {
  id: string
  name: string
  description: string | null
  subtitle?: string | null
  welcomeText?: string | null
  eventDate?: string | null
  accentColor?: string | null
  coverThumbUrl?: string | null
  coverWebUrl?: string | null
  allow_download: boolean
}

type Studio = {
  name: string
  logoUrl: string | null
  primaryColor?: string | null
  hideBranding?: boolean
  footerHtml?: string | null
}

type Track = "high_quality" | "social"

const TRACK_META: Record<
  Track,
  { Icon: LucideIcon; title: string; blurb: string; resolution: "original" | "web" }
> = {
  high_quality: {
    Icon: Gem,
    title: "Máxima Calidad",
    blurb:
      "JPG en alta resolución, sin comprimir — ideales para imprimir, ampliar y archivar.",
    resolution: "original",
  },
  social: {
    Icon: Smartphone,
    title: "Redes Sociales",
    blurb:
      "Optimizadas para Instagram, Facebook y WhatsApp — suben rápido y se ven perfectas en pantalla.",
    resolution: "web",
  },
}

/** Polling del export ZIP (endpoint público por token) hasta que está listo. */
async function waitForZip(token: string, exportId: string): Promise<string> {
  const base = `/api/galleries/public/${token}/zip/${exportId}`
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const res = await fetch(base)
    if (!res.ok) continue
    const data = (await res.json()) as { status: string; error?: string | null }
    if (data.status === "ready" || data.status === "completed") {
      return `${base}?download=1`
    }
    if (data.status === "failed") {
      throw new Error(data.error ?? "La descarga falló al generarse")
    }
  }
  throw new Error("La descarga está tardando demasiado — intentá de nuevo en unos minutos")
}

export function FinalDeliveryView({
  token,
  gallery,
  assets,
  studio,
  driveLink,
}: {
  token: string
  gallery: Gallery
  assets: Asset[]
  studio: Studio
  driveLink: string | null
}) {
  // Entrega final = experiencia luxury fija (dorado). Solo respetamos un accent
  // por-galería si es un hex válido; valores legacy tipo "blue"/"violet" (de los
  // temas de selección) se ignoran para garantizar la estética premium.
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(gallery.accentColor ?? "")
    ? (gallery.accentColor as string)
    : GOLD

  const byTrack = useMemo(() => {
    const hq = assets.filter((a) => a.deliveryTrack === "high_quality")
    const social = assets.filter((a) => a.deliveryTrack === "social")
    const rest = assets.filter(
      (a) => a.deliveryTrack !== "high_quality" && a.deliveryTrack !== "social",
    )
    // Fotos sin track (galerías viejas) van a Máxima Calidad para que no se pierdan.
    return { high_quality: [...hq, ...rest], social }
  }, [assets])

  const [lightbox, setLightbox] = useState<{ list: Asset[]; idx: number } | null>(null)
  const [selecting, setSelecting] = useState<Track | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [zipBusy, setZipBusy] = useState<string | null>(null) // key del botón ocupado

  const requestZip = useCallback(
    async (key: string, assetIds: string[], resolution: "original" | "web") => {
      if (assetIds.length === 0) {
        toast.error("No hay fotos para descargar")
        return
      }
      setZipBusy(key)
      try {
        const res = await fetch(`/api/galleries/public/${token}/zip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "selection", assetIds, resolution }),
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(err?.error ?? "No se pudo iniciar la descarga")
        }
        const { exportId } = (await res.json()) as { exportId: string }
        toast.info("Preparando tu ZIP… puede tardar un momento")
        const url = await waitForZip(token, exportId)
        window.location.href = url
        toast.success("¡Descarga iniciada!")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al descargar")
      } finally {
        setZipBusy(null)
      }
    },
    [token],
  )

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startSelecting = (track: Track) => {
    setSelecting(track)
    setSelected(new Set())
  }

  const cover = gallery.coverWebUrl || gallery.coverThumbUrl

  return (
    <div className="min-h-screen bg-[#faf9f7] text-[#1a1614]">
      {/* ── Hero ── */}
      <header className="relative overflow-hidden">
        {cover && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[#faf9f7]" />
          </>
        )}
        <div
          className={cn(
            "relative mx-auto flex max-w-3xl flex-col items-center px-6 pb-16 pt-20 text-center",
            cover ? "text-white" : "text-[#1a1614]",
          )}
        >
          {studio.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={studio.logoUrl} alt={studio.name} className="mb-8 h-10 w-auto" />
          )}
          <p
            className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.25em]"
            style={{ color: cover ? GOLD_SOFT : accent }}
          >
            <Sparkles className="h-3 w-3" /> Tu entrega final está lista
          </p>
          <h1 className="font-serif text-4xl font-medium leading-tight sm:text-5xl">
            {gallery.name}
          </h1>
          {(gallery.subtitle || gallery.description) && (
            <p className={cn("mt-4 max-w-xl text-sm leading-relaxed", cover ? "text-white/85" : "text-[#3a322b]")}>
              {gallery.subtitle || gallery.description}
            </p>
          )}
          <p className={cn("mt-6 text-xs", cover ? "text-white/70" : "text-[#6b6760]")}>
            {assets.length} fotografía{assets.length === 1 ? "" : "s"} editada{assets.length === 1 ? "" : "s"} con amor
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        {/* ── Google Drive destacado ── */}
        {driveLink && (
          <a
            href={driveLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-6 flex items-center gap-4 rounded-2xl border-2 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            style={{ borderColor: accent }}
          >
            <svg className="h-10 w-10 shrink-0" viewBox="0 0 87.3 78">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/>
              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Descargar todo desde Google Drive</p>
              <p className="text-[12.5px] text-[#6b6760]">
                Ambas carpetas (Máxima Calidad y Redes) en un solo lugar — guardalas en tu computadora o nube personal.
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-4 py-2 text-[12.5px] font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              Abrir Drive →
            </span>
          </a>
        )}

        {/* ── Aviso 6 meses ── */}
        <div className="mb-10 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-[12.5px] leading-relaxed text-amber-900">
            <strong>Guardá tus fotos antes de 6 meses.</strong> Esta galería y nuestros
            respaldos estarán disponibles por 6 meses desde hoy. Descargá tus fotos y
            guardalas en al menos dos lugares (computadora + disco externo o nube).
            Pasado ese plazo no podremos recuperar el material.
          </p>
        </div>

        {/* ── Secciones por carpeta ── */}
        {(Object.keys(TRACK_META) as Track[]).map((track) => {
          const meta = TRACK_META[track]
          const list = byTrack[track]
          if (list.length === 0) return null
          const isSelectingHere = selecting === track
          const selCount = isSelectingHere
            ? list.filter((a) => selected.has(a.id)).length
            : 0

          return (
            <section key={track} className="mb-14">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2.5 font-serif text-2xl font-medium">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${accent}1f`, color: accent }}
                    >
                      <meta.Icon className="h-[18px] w-[18px]" />
                    </span>
                    {meta.title}
                    <span className="align-middle text-sm font-normal text-[#6b6760]">
                      {list.length} foto{list.length === 1 ? "" : "s"}
                    </span>
                  </h2>
                  <p className="mt-1 max-w-lg text-[13px] text-[#6b6760]">{meta.blurb}</p>
                </div>

                {gallery.allow_download && (
                  <div className="flex flex-wrap items-center gap-2">
                    {isSelectingHere ? (
                      <>
                        <button
                          type="button"
                          disabled={selCount === 0 || zipBusy !== null}
                          onClick={() =>
                            requestZip(
                              `sel-${track}`,
                              list.filter((a) => selected.has(a.id)).map((a) => a.id),
                              meta.resolution,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
                          style={{ backgroundColor: accent }}
                        >
                          {zipBusy === `sel-${track}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Descargar {selCount > 0 ? `(${selCount})` : "selección"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelecting(null)}
                          className="rounded-full border border-[#d8d4cd] bg-white px-4 py-2 text-[12.5px] font-medium text-[#6b6760] hover:border-[#b8b3aa]"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={zipBusy !== null}
                          onClick={() =>
                            requestZip(
                              `all-${track}`,
                              list.map((a) => a.id),
                              meta.resolution,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
                          style={{ backgroundColor: accent }}
                        >
                          {zipBusy === `all-${track}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Descargar carpeta completa
                        </button>
                        <button
                          type="button"
                          onClick={() => startSelecting(track)}
                          className="rounded-full border border-[#d8d4cd] bg-white px-4 py-2 text-[12.5px] font-medium text-[#3a322b] hover:border-[#b8b3aa]"
                        >
                          Elegir cuáles
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {list.map((a, idx) => {
                  const isSel = isSelectingHere && selected.has(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() =>
                        isSelectingHere
                          ? toggleSelected(a.id)
                          : setLightbox({ list, idx })
                      }
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-lg bg-[#eceae6] transition-all",
                        isSel && "ring-2 ring-offset-2",
                      )}
                      style={isSel ? ({ "--tw-ring-color": accent } as React.CSSProperties) : undefined}
                    >
                      {a.thumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.thumbUrl}
                          alt=""
                          loading="lazy"
                          className={cn(
                            "h-full w-full object-cover transition-transform duration-300",
                            !isSelectingHere && "group-hover:scale-[1.03]",
                          )}
                        />
                      )}
                      {isSelectingHere && (
                        <span
                          className={cn(
                            "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white/90 transition-colors",
                            isSel ? "border-transparent text-white" : "border-[#b8b3aa] text-transparent",
                          )}
                          style={isSel ? { backgroundColor: accent } : undefined}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}

        {/* ── Cierre ── */}
        <div className="mt-4 rounded-2xl bg-[#1a1614] px-6 py-10 text-center text-white">
          <Sparkles className="mx-auto mb-3 h-5 w-5" style={{ color: accent }} />
          <p className="font-serif text-xl">Gracias por confiar en {studio.name}</p>
          <p className="mt-2 text-[13px] text-white/70">
            Si te encantaron tus fotos, nos ayudaría muchísimo que nos dejes una reseña. 💛
          </p>
        </div>
      </main>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {lightbox.idx > 0 && (
            <button
              type="button"
              className="absolute left-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation()
                setLightbox((p) => p && { ...p, idx: p.idx - 1 })
              }}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {lightbox.idx < lightbox.list.length - 1 && (
            <button
              type="button"
              className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation()
                setLightbox((p) => p && { ...p, idx: p.idx + 1 })
              }}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.list[lightbox.idx]?.webUrl ?? lightbox.list[lightbox.idx]?.thumbUrl ?? ""}
            alt=""
            className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {!studio.hideBranding && (
        <footer className="pb-8 text-center text-[11px] text-[#9a958c]">
          {studio.footerHtml ? (
            <span dangerouslySetInnerHTML={{ __html: studio.footerHtml }} />
          ) : (
            <span>{studio.name}</span>
          )}
        </footer>
      )}
    </div>
  )
}
