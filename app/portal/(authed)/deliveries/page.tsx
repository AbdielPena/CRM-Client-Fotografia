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
import { PortalDeliveryReviewMarker } from "@/components/portal/portal-delivery-review-marker"

export const dynamic = "force-dynamic"

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: "En preparación",
  delivered: "Lista para vos",
  reviewed: "Vista",
}

const STATUS_COLOR: Record<DeliveryStatus, string> = {
  pending: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  delivered:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  reviewed:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
}

export default async function PortalDeliveriesPage() {
  const session = parsePortalCookieValue(cookies().get(PORTAL_COOKIE_NAME)?.value)
  if (!session) return null

  const deliveries = await listDeliveriesForPortal(session.clientId)
  const visible = deliveries.filter(
    (d) => d.status === "delivered" || d.status === "reviewed",
  )

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Tus entregas finales
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Acá vas a encontrar las fotos editadas, archivos y enlaces que tu
          fotógrafo te compartió.
        </p>
      </header>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <Package className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Aún no hay entregas
          </p>
          <p className="mt-1 text-[12.5px] text-zinc-500 dark:text-zinc-400">
            Te avisaremos por email apenas tu fotógrafo cargue tus fotos editadas.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((d) => (
            <div
              key={d.id}
              className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <PortalDeliveryReviewMarker
                deliveryId={d.id}
                alreadyReviewed={d.status === "reviewed"}
              />
              <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        {d.title}
                      </h2>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_COLOR[d.status]}`}
                      >
                        {d.status === "delivered" && <Send className="h-2.5 w-2.5" />}
                        {d.status === "reviewed" && <Check className="h-2.5 w-2.5" />}
                        {STATUS_LABEL[d.status]}
                      </span>
                    </div>
                    {d.description && (
                      <p className="mt-1 text-[12.5px] text-zinc-600 dark:text-zinc-400">
                        {d.description}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-400">
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
                <div className="grid grid-cols-1 gap-2 p-5 sm:grid-cols-2">
                  {(d.files as DeliveryFile[]).map((f) => (
                    <a
                      key={f.url}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <Download className="h-4 w-4 flex-shrink-0 text-zinc-500 group-hover:text-rose-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {f.name}
                        </p>
                        {f.size && (
                          <p className="text-[11px] text-zinc-500">
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
                      className="group inline-flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <LinkIcon className="h-4 w-4 flex-shrink-0 text-zinc-500 group-hover:text-rose-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {l.label}
                        </p>
                        <p className="truncate text-[11px] text-zinc-500">
                          {l.url}
                        </p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
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
