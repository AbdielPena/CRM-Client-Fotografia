import { cookies } from "next/headers"
import {
  Package,
  Download,
  Link as LinkIcon,
  Check,
  Send,
  ExternalLink,
} from "lucide-react"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import {
  listDeliveriesForPortal,
  type DeliveryFile,
  type ExternalLink as ExtLink,
  type DeliveryStatus,
} from "@/server/services/client-delivery.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { getAssetThumbUrl } from "@/server/services/gallery.service"
import { PortalDeliveryReviewMarker } from "@/components/portal/portal-delivery-review-marker"
import { PortalHeader, PortalEmpty } from "@/components/portal/portal-ui"
import Link from "next/link"
import { Sparkles, ArrowRight } from "lucide-react"

export const dynamic = "force-dynamic"

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: "En preparación",
  delivered: "Lista para ti",
  reviewed: "Vista",
}

const STATUS_COLOR: Record<DeliveryStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  delivered:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  reviewed: "bg-brand-soft text-gold-700",
}

export default async function PortalDeliveriesPage() {
  const session = parsePortalCookieValue(cookies().get(PORTAL_COOKIE_NAME)?.value)
  if (!session) return null

  const deliveries = await listDeliveriesForPortal(session.clientId)
  const visible = deliveries.filter(
    (d) => d.status === "delivered" || d.status === "reviewed",
  )

  // Galerías de entrega final del cliente (las fotos editadas como galería).
  // Cast a any: gallery_type no está en los tipos generados de la tabla.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createSupabaseServiceClient() as any
  const { data: galRaw } = await supabase
    .from("galleries")
    .select("id, name, cover_asset_id, asset_count, created_at")
    .eq("client_id", session.clientId)
    .eq("gallery_type", "final_delivery")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalGalleries = (galRaw ?? []) as any[]

  // Portadas + tokens públicos de esas galerías
  const coverIds = finalGalleries
    .map((g) => g.cover_asset_id as string | null)
    .filter(Boolean) as string[]
  const thumbs: Record<string, string | null> = {}
  if (coverIds.length > 0) {
    const { data } = await supabase
      .from("gallery_assets")
      .select("id, thumb_key")
      .in("id", coverIds)
    for (const r of (data ?? []) as Array<{ id: string; thumb_key: string | null }>) {
      thumbs[r.id] = getAssetThumbUrl(r.thumb_key)
    }
  }
  const galleryIds = finalGalleries.map((g) => g.id as string)
  const tokenByGallery: Record<string, string> = {}
  if (galleryIds.length > 0) {
    const { data: toks } = await supabase
      .from("gallery_share_tokens")
      .select("gallery_id, token, revoked_at, expires_at")
      .in("gallery_id", galleryIds)
    for (const t of (toks ?? []) as Array<{
      gallery_id: string
      token: string
      revoked_at: string | null
      expires_at: string | null
    }>) {
      if (t.revoked_at) continue
      if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) continue
      if (!tokenByGallery[t.gallery_id]) tokenByGallery[t.gallery_id] = t.token
    }
  }

  const nothingAtAll = visible.length === 0 && finalGalleries.length === 0

  return (
    <div className="space-y-8">
      <PortalHeader
        eyebrow="Tus fotos"
        title="Tus entregas finales"
        description="Aquí encontrarás las fotos editadas, archivos y enlaces que tu fotógrafo compartió contigo."
      />

      {/* Galerías de entrega final */}
      {finalGalleries.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {finalGalleries.map((g, i) => {
            const cover = g.cover_asset_id ? thumbs[g.cover_asset_id] : null
            const token = tokenByGallery[g.id]
            const href = token ? `/g/${token}` : "/portal/galleries"
            return (
              <Link
                key={g.id}
                href={href}
                target={token ? "_blank" : undefined}
                className="lx-card lx-card-hover group animate-fade-in-up overflow-hidden p-0"
                style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
              >
                <div className="relative aspect-[16/9] bg-brand-soft">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gold-500">
                      <Sparkles className="h-7 w-7" />
                    </div>
                  )}
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10.5px] font-semibold text-gold-700 shadow-sm">
                    <Sparkles className="h-3 w-3" /> Entrega final
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-serif text-base font-semibold text-foreground">
                      {g.name}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {g.asset_count ?? 0} foto{(g.asset_count ?? 0) === 1 ? "" : "s"} · ver y descargar
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {nothingAtAll ? (
        <PortalEmpty
          icon={Package}
          title="Aún no hay entregas"
          description="Te avisaremos por email apenas tu fotógrafo cargue tus fotos editadas."
        />
      ) : (
        <div className="space-y-4">
          {visible.map((d, i) => (
            <div
              key={d.id}
              className="lx-card animate-fade-in-up overflow-hidden p-0"
              style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
            >
              <PortalDeliveryReviewMarker
                deliveryId={d.id}
                alreadyReviewed={d.status === "reviewed"}
              />
              <div className="border-b border-border px-6 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h2 className="font-serif text-lg font-semibold text-foreground">
                        {d.title}
                      </h2>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${STATUS_COLOR[d.status]}`}
                      >
                        {d.status === "delivered" && <Send className="h-2.5 w-2.5" />}
                        {d.status === "reviewed" && <Check className="h-2.5 w-2.5" />}
                        {STATUS_LABEL[d.status]}
                      </span>
                    </div>
                    {d.description && (
                      <p className="mt-1.5 text-[13px] text-muted-foreground">
                        {d.description}
                      </p>
                    )}
                  </div>
                  <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {new Intl.DateTimeFormat("es", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(d.delivered_at ?? d.created_at))}
                  </span>
                </div>
              </div>

              {((d.files as DeliveryFile[]).length > 0 ||
                (d.external_links as ExtLink[]).length > 0) && (
                <div className="grid grid-cols-1 gap-2.5 p-6 sm:grid-cols-2">
                  {(d.files as DeliveryFile[]).map((f) => (
                    <a
                      key={f.url}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 transition-all hover:border-gold-300 hover:shadow-luxe"
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft text-gold-600">
                        <Download className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {f.name}
                        </p>
                        {f.size && (
                          <p className="text-[11px] text-muted-foreground">
                            {fmtBytes(f.size)}
                          </p>
                        )}
                      </div>
                    </a>
                  ))}
                  {(d.external_links as ExtLink[]).map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 transition-all hover:border-gold-300 hover:shadow-luxe"
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft text-gold-600">
                        <LinkIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {l.label}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {l.url}
                        </p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function fmtBytes(n?: number) {
  if (!n) return ""
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}
