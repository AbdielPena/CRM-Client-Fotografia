import Link from "next/link"
import {
  Mail,
  Send,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getMailSent } from "@/server/services/mail-draft.service"
import { getMailAccounts } from "@/server/services/mail-account.service"
import { relativeTime as relativeFromDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { Pagination } from "@/components/shared/pagination"

export const metadata: Metadata = { title: "Enviados · Correo" }

const PAGE_SIZE = 25

export default async function MailSentPage({
  searchParams,
}: {
  searchParams?: { page?: string; account?: string }
}) {
  const session = await requireStudioAuth()
  const page = Math.max(1, Number(searchParams?.page) || 1)
  const accountId = searchParams?.account || undefined

  const [accounts, sent, unread] = await Promise.all([
    getMailAccounts(session.studioId),
    getMailSent(session.studioId, { accountId, page, pageSize: PAGE_SIZE }),
    countUnreadNotifications(session.studioId),
  ])

  if (accounts.length === 0) {
    return (
      <>
        <AppTopbar
          eyebrow="Correo"
          title="Enviados"
          unreadNotifications={unread}
        />
        <main className="mx-auto max-w-3xl px-4 py-12">
          <EmptyState
            icon={<Mail className="size-12 text-muted-foreground/60" />}
            title="Sin cuentas configuradas"
            description="Configura Mailcow primero."
          >
            <Button asChild>
              <Link href="/settings/mail">Configurar</Link>
            </Button>
          </EmptyState>
        </main>
      </>
    )
  }

  return (
    <>
      <AppTopbar
        eyebrow="Correo"
        title="Enviados"
        description={`${sent.total} correos enviados`}
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/mail/compose">
              <Mail className="mr-1 size-4" />
              Redactar
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Tab nav entre Inbox/Sent/Drafts */}
        <MailTabs current="sent" />

        {sent.total === 0 ? (
          <EmptyState
            icon={<Send className="size-12 text-muted-foreground/60" />}
            title="Sin correos enviados"
            description="Los emails enviados aparecerán aquí. Compose uno nuevo para empezar."
          >
            <Button asChild>
              <Link href="/mail/compose">Redactar email</Link>
            </Button>
          </EmptyState>
        ) : (
          <div className="sf-card overflow-hidden">
            <ul className="divide-y divide-border">
              {sent.items.map((m) => {
                const recipient =
                  m.to_recipients?.[0]?.name ??
                  m.to_recipients?.[0]?.email ??
                  "—"
                const StatusIcon = statusIcon(m.status)
                return (
                  <li key={m.id}>
                    <Link
                      href={
                        m.thread_id
                          ? `/mail/threads/${m.thread_id}`
                          : `/mail/messages/${m.id}`
                      }
                      className="flex items-start gap-3 p-4 transition-colors hover:bg-accent/30"
                    >
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground"
                        aria-hidden
                      >
                        →
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            Para: {recipient}
                            {m.to_recipients && m.to_recipients.length > 1 && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                +{m.to_recipients.length - 1}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {m.sent_at ? relativeFromDate(m.sent_at) : "—"}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className="truncate text-sm text-muted-foreground">
                            {m.subject ?? "(sin subject)"}
                          </p>
                          {m.has_attachments && (
                            <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                          )}
                          <StatusBadge status={m.status} />
                        </div>
                        {m.snippet && (
                          <p className="mt-1 truncate text-xs text-muted-foreground/70">
                            {m.snippet}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
            {sent.totalPages > 1 && (
              <div className="border-t border-border p-3">
                <Pagination
                  page={sent.page}
                  totalPages={sent.totalPages}
                  total={sent.total}
                  pageSize={sent.pageSize}
                  baseHref="/mail/sent"
                  preserveQuery={{ account: accountId || undefined }}
                  itemsLabel="enviados"
                />
              </div>
            )}
          </div>
        )}
      </main>
    </>
  )
}

function MailTabs({ current }: { current: "inbox" | "sent" | "drafts" }) {
  const tabs = [
    { key: "inbox", label: "Bandeja", href: "/mail/inbox" },
    { key: "sent", label: "Enviados", href: "/mail/sent" },
    { key: "drafts", label: "Borradores", href: "/mail/drafts" },
  ] as const
  return (
    <div className="mb-6 inline-flex gap-1 rounded-xl bg-muted p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
            (current === t.key
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}

function statusIcon(status: string): typeof CheckCircle2 {
  switch (status) {
    case "sent":
    case "delivered":
      return CheckCircle2
    case "bounced":
    case "failed":
      return AlertCircle
    default:
      return Clock
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    sent: { label: "Enviado", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
    delivered: {
      label: "Entregado",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    bounced: {
      label: "Rebotado",
      cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    },
    failed: {
      label: "Fallido",
      cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    },
  }
  const m = map[status]
  if (!m) return null
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  )
}
