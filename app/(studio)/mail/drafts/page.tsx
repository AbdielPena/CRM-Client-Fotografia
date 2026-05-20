import Link from "next/link"
import { Mail, FileText, Edit3, Trash2 } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getMailDrafts } from "@/server/services/mail-draft.service"
import { getMailAccounts } from "@/server/services/mail-account.service"
import { relativeTime as relativeFromDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { Pagination } from "@/components/shared/pagination"

export const metadata: Metadata = { title: "Borradores · Correo" }

const PAGE_SIZE = 25

export default async function MailDraftsPage({
  searchParams,
}: {
  searchParams?: { page?: string; account?: string }
}) {
  const session = await requireStudioAuth()
  const page = Math.max(1, Number(searchParams?.page) || 1)
  const accountId = searchParams?.account || undefined

  const [accounts, drafts, unread] = await Promise.all([
    getMailAccounts(session.studioId),
    getMailDrafts(session.studioId, { accountId, page, pageSize: PAGE_SIZE }),
    countUnreadNotifications(session.studioId),
  ])

  if (accounts.length === 0) {
    return (
      <>
        <AppTopbar
          eyebrow="Correo"
          title="Borradores"
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
        title="Borradores"
        description={`${drafts.total} borradores guardados (auto-save c/5s)`}
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/mail/compose">
              <Edit3 className="mr-1 size-4" />
              Nuevo
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <MailTabs current="drafts" />

        {drafts.total === 0 ? (
          <EmptyState
            icon={<FileText className="size-12 text-muted-foreground/60" />}
            title="Sin borradores"
            description="Cuando redactes un email y no lo envíes, se guarda automáticamente aquí cada 5 segundos."
          >
            <Button asChild>
              <Link href="/mail/compose">Redactar email</Link>
            </Button>
          </EmptyState>
        ) : (
          <div className="sf-card overflow-hidden">
            <ul className="divide-y divide-border">
              {drafts.items.map((d) => {
                const recipient =
                  d.to_recipients?.[0]?.email ?? "Sin destinatario"
                return (
                  <li key={d.id}>
                    <Link
                      href={`/mail/compose?draftId=${d.id}`}
                      className="flex items-start gap-3 p-4 transition-colors hover:bg-accent/30"
                    >
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        aria-hidden
                      >
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            Para: {recipient}
                            {d.to_recipients && d.to_recipients.length > 1 && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                +{d.to_recipients.length - 1}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            Editado {relativeFromDate(d.updated_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {d.subject ?? "(sin subject)"}
                        </p>
                        {d.snippet && (
                          <p className="mt-1 truncate text-xs text-muted-foreground/70">
                            {d.snippet}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
            {drafts.totalPages > 1 && (
              <div className="border-t border-border p-3">
                <Pagination
                  page={drafts.page}
                  totalPages={drafts.totalPages}
                  total={drafts.total}
                  pageSize={drafts.pageSize}
                  baseHref="/mail/drafts"
                  preserveQuery={{ account: accountId || undefined }}
                  itemsLabel="borradores"
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
