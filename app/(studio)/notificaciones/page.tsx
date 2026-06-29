import Link from "next/link"
import type { Metadata } from "next"
import { CheckCircle2, AlertCircle, Clock, Mail, User } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  listOutgoingNotifications,
  OUTGOING_CATEGORY_LABELS,
  type OutgoingCategory,
} from "@/server/services/outgoing-notifications.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { cn } from "@/lib/utils/cn"

export const metadata: Metadata = { title: "Correos enviados" }
export const dynamic = "force-dynamic"

const TAB_ORDER: Array<OutgoingCategory | "all"> = [
  "all",
  "engagement",
  "gallery",
  "delivery",
  "contract",
  "invoice",
  "booking",
  "client",
  "otros",
]

function statusBadge(status: string) {
  if (status === "sent")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Enviado
      </span>
    )
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
        <AlertCircle className="h-3 w-3" /> Falló
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-medium text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
      <Clock className="h-3 w-3" /> Pendiente
    </span>
  )
}

export default async function NotificacionesPage({
  searchParams,
}: {
  searchParams?: { cat?: string; page?: string }
}) {
  const session = await requireStudioAuth()
  const cat = (searchParams?.cat ?? "all") as OutgoingCategory | "all"
  const page = Math.max(1, Number(searchParams?.page) || 1)

  const [{ items, total, counts }, unread] = await Promise.all([
    listOutgoingNotifications(session.studioId, { category: cat, page }),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Comunicación"
        title="Correos enviados"
        description="Todos los emails que el sistema envió a tus clientes, organizados por categoría."
        unreadNotifications={unread}
      />

      <div className="px-6 py-6 lg:px-8 lg:py-8">
        {/* Tabs por categoría */}
        <div className="mb-5 flex flex-wrap gap-1.5">
          {TAB_ORDER.map((c) => {
            const count = c === "all" ? (counts.all ?? 0) : (counts[c] ?? 0)
            if (c !== "all" && count === 0) return null
            const active = cat === c
            return (
              <Link
                key={c}
                href={c === "all" ? "/notificaciones" : `/notificaciones?cat=${c}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-border-strong",
                )}
              >
                {c === "all" ? "Todos" : OUTGOING_CATEGORY_LABELS[c]}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10.5px] tabular-nums",
                    active ? "bg-white/20" : "bg-muted",
                  )}
                >
                  {count}
                </span>
              </Link>
            )
          })}
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
            <Mail className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aún no hay correos {cat !== "all" ? "en esta categoría" : "enviados"}.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {(() => {
              const rows: JSX.Element[] = []
              let lastKey: string | null = null
              for (const n of items) {
                const clientName = n.toName?.trim() || n.toEmail || "—"
                const key = clientName.toLowerCase()
                if (key !== lastKey) {
                  lastKey = key
                  rows.push(
                    <div
                      key={`h-${key}`}
                      className="flex items-center gap-2 bg-muted/40 px-4 py-2"
                    >
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-[11.5px] font-semibold text-foreground">
                        {clientName}
                      </span>
                      {n.toName && (
                        <span className="truncate text-[11px] text-muted-foreground">
                          · {n.toEmail}
                        </span>
                      )}
                    </div>,
                  )
                }
                rows.push(
                  <Link
                    key={n.id}
                    href={`/notificaciones/${n.id}`}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {n.subject}
                        </p>
                        {statusBadge(n.status)}
                      </div>
                      {n.templateLabel && (
                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                          {n.templateLabel}
                        </p>
                      )}
                      {n.status === "failed" && n.lastError && (
                        <p className="mt-0.5 truncate text-[11px] text-rose-500">
                          {n.lastError}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                        {OUTGOING_CATEGORY_LABELS[n.category]}
                      </span>
                      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                        {new Date(n.sentAt ?? n.createdAt).toLocaleString("es-DO", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </Link>,
                )
              }
              return rows
            })()}
          </div>
        )}

        {total > 30 && (
          <div className="mt-4 flex items-center justify-center gap-2 text-[12.5px]">
            {page > 1 && (
              <Link
                href={`/notificaciones?cat=${cat}&page=${page - 1}`}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-muted-foreground hover:border-border-strong"
              >
                ← Anterior
              </Link>
            )}
            <span className="text-muted-foreground">
              Página {page} de {Math.ceil(total / 30)}
            </span>
            {page * 30 < total && (
              <Link
                href={`/notificaciones?cat=${cat}&page=${page + 1}`}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-muted-foreground hover:border-border-strong"
              >
                Siguiente →
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  )
}
