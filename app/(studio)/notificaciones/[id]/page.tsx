import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ArrowLeft, CheckCircle2, AlertCircle, Clock } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getOutgoingNotification,
  OUTGOING_CATEGORY_LABELS,
} from "@/server/services/outgoing-notifications.service"
import { AppTopbar } from "@/components/layout/app-topbar"

export const metadata: Metadata = { title: "Detalle del correo" }
export const dynamic = "force-dynamic"

/** Link interno a la entidad relacionada (si la conocemos). */
function relatedHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null
  switch (type) {
    case "gallery":
      return `/galleries/${id}`
    case "project":
      return `/projects/${id}`
    case "client":
      return `/clients/${id}`
    case "invoice":
      return `/invoices/${id}`
    case "contract":
      return `/contracts/${id}`
    default:
      return null
  }
}

export default async function NotificacionDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const [email, unread] = await Promise.all([
    getOutgoingNotification(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])
  if (!email) notFound()

  const related = relatedHref(email.relatedEntityType, email.relatedEntityId)

  return (
    <>
      <AppTopbar
        eyebrow="Comunicación"
        title="Detalle del correo"
        unreadNotifications={unread}
      />

      <div className="px-6 py-6 lg:px-8 lg:py-8">
        <Link
          href="/notificaciones"
          className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a correos enviados
        </Link>

        <div className="max-w-3xl space-y-4">
          {/* Header */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {email.status === "sent" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Enviado
                </span>
              ) : email.status === "failed" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                  <AlertCircle className="h-3.5 w-3.5" /> Falló
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                  <Clock className="h-3.5 w-3.5" /> Pendiente
                </span>
              )}
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {OUTGOING_CATEGORY_LABELS[email.category]}
              </span>
              {email.templateLabel && (
                <span className="text-[11px] text-muted-foreground">
                  Plantilla: {email.templateLabel}
                </span>
              )}
            </div>

            <h1 className="text-base font-semibold text-foreground">{email.subject}</h1>
            <dl className="mt-3 space-y-1 text-[12.5px]">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted-foreground">Para:</dt>
                <dd className="text-foreground">
                  {email.toName ? `${email.toName} <${email.toEmail}>` : email.toEmail}
                </dd>
              </div>
              {email.fromName && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-muted-foreground">De:</dt>
                  <dd className="text-foreground">
                    {email.fromName}
                    {email.fromEmail ? ` <${email.fromEmail}>` : ""}
                  </dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted-foreground">Fecha:</dt>
                <dd className="text-foreground">
                  {new Date(email.sentAt ?? email.createdAt).toLocaleString("es-DO", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
              {related && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-muted-foreground">Origen:</dt>
                  <dd>
                    <Link href={related} className="text-brand hover:underline">
                      Ver {email.relatedEntityType} →
                    </Link>
                  </dd>
                </div>
              )}
            </dl>

            {email.status === "failed" && email.lastError && (
              <div className="mt-3 rounded-lg border border-rose-300/50 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {email.lastError}
              </div>
            )}
          </div>

          {/* Preview del HTML en iframe sandbox */}
          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <p className="border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Vista previa
            </p>
            <iframe
              sandbox=""
              srcDoc={email.bodyHtml}
              className="h-[600px] w-full"
              title="Contenido del correo"
            />
          </div>
        </div>
      </div>
    </>
  )
}
