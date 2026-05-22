import Link from "next/link"
import {
  Mail,
  Inbox,
  Paperclip,
  Search as SearchIcon,
  Star,
  Settings,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getMailThreads } from "@/server/services/mail-thread.service"
import { getMailAccounts } from "@/server/services/mail-account.service"
import { relativeTime as relativeFromDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/shared/search-input"
import { EmptyState } from "@/components/shared/empty-state"
import { Pagination } from "@/components/shared/pagination"

export const metadata: Metadata = { title: "Bandeja de entrada · Correo" }

const PAGE_SIZE = 25

type SearchParamsShape = {
  q?: string
  page?: string
  account?: string
  unread?: string
}

export default async function MailInboxPage({
  searchParams,
}: {
  searchParams?: SearchParamsShape
}) {
  const session = await requireStudioAuth()

  const search = searchParams?.q?.trim() ?? ""
  const page = Math.max(1, Number(searchParams?.page) || 1)
  const accountId = searchParams?.account || undefined
  const unreadOnly = searchParams?.unread === "1"

  const [accounts, threads, unread] = await Promise.all([
    getMailAccounts(session.studioId),
    getMailThreads(session.studioId, {
      search: search || undefined,
      accountId,
      unreadOnly,
      page,
      pageSize: PAGE_SIZE,
    }),
    countUnreadNotifications(session.studioId),
  ])

  // Early return: si no hay accounts, mostrar CTA setup
  if (accounts.length === 0) {
    return (
      <>
        <AppTopbar
          eyebrow="Correo"
          title="Bandeja de entrada"
          description="Sincroniza tus correos Mailcow para gestionarlos desde el monolito."
          unreadNotifications={unread}
        />
        <main className="mx-auto max-w-3xl px-4 py-12">
          <EmptyState
            icon={<Mail className="size-12 text-muted-foreground/60" />}
            title="Sin cuentas de correo configuradas"
            description="Conecta tu cuenta Mailcow para empezar a recibir y enviar emails."
          >
            <Button asChild>
              <Link href="/settings/mail">
                <Settings className="mr-1 size-4" />
                Configurar Mailcow
              </Link>
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
        title="Bandeja de entrada"
        description={`${threads.total} conversaciones${unreadOnly ? " no leídas" : ""}`}
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
        <MailTabs current="inbox" />

        {/* Search + filtros */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Buscar en subject..." />
          <FilterChip
            href={
              unreadOnly
                ? buildHref({ ...searchParams, unread: undefined })
                : buildHref({ ...searchParams, unread: "1" })
            }
            active={unreadOnly}
            label="No leídos"
          />
          {/* Filtros por cuenta si hay >1 */}
          {accounts.length > 1 && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <FilterChip
                href={buildHref({ ...searchParams, account: undefined })}
                active={!accountId}
                label="Todas las cuentas"
              />
              {accounts.map((a) => (
                <FilterChip
                  key={a.id}
                  href={
                    accountId === a.id
                      ? buildHref({ ...searchParams, account: undefined })
                      : buildHref({ ...searchParams, account: a.id })
                  }
                  active={accountId === a.id}
                  label={a.email}
                />
              ))}
            </>
          )}
        </div>

        {/* Lista de threads */}
        {threads.total === 0 ? (
          <EmptyState
            icon={<Inbox className="size-12 text-muted-foreground/60" />}
            title={
              search || unreadOnly
                ? "Sin resultados"
                : "Inbox vacío"
            }
            description={
              search
                ? `No hay conversaciones con "${search}"`
                : "Aún no se han sincronizado correos. El cron corre c/5 minutos."
            }
          />
        ) : (
          <div className="sf-card overflow-hidden">
            <ul className="divide-y divide-border">
              {threads.items.map((t) => {
                const senderName =
                  t.participants?.[0]?.name ??
                  t.participants?.[0]?.email ??
                  "—"
                const isUnread = t.unread_count > 0
                return (
                  <li key={t.id}>
                    <Link
                      href={`/mail/threads/${t.id}`}
                      className={
                        "flex items-start gap-3 p-4 transition-colors hover:bg-accent/30 " +
                        (isUnread ? "bg-primary/5" : "")
                      }
                    >
                      {/* Avatar circular con inicial */}
                      <span
                        className={
                          "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold " +
                          (isUnread
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground")
                        }
                        aria-hidden
                      >
                        {senderName.charAt(0).toUpperCase()}
                      </span>

                      <div className="min-w-0 flex-1">
                        {/* Línea 1: sender + timestamp */}
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={
                              "truncate text-sm " +
                              (isUnread
                                ? "font-bold text-foreground"
                                : "font-medium text-foreground")
                            }
                          >
                            {senderName}
                            {t.participants && t.participants.length > 1 && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                +{t.participants.length - 1}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {relativeFromDate(t.last_message_at)}
                          </span>
                        </div>

                        {/* Línea 2: subject + meta */}
                        <div className="mt-0.5 flex items-center gap-2">
                          <p
                            className={
                              "truncate text-sm " +
                              (isUnread
                                ? "font-semibold text-foreground"
                                : "text-muted-foreground")
                            }
                          >
                            {t.subject ?? "(sin subject)"}
                          </p>
                          {t.has_attachments && (
                            <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                          )}
                          {t.unread_count > 1 && (
                            <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                              {t.unread_count}
                            </span>
                          )}
                        </div>

                        {/* Línea 3: vinculaciones cross-módulo */}
                        {(t.client || t.project || t.invoice) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {t.client && (
                              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                👤 {t.client.name}
                              </span>
                            )}
                            {t.project && (
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                📁 {t.project.name}
                              </span>
                            )}
                            {t.invoice && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-mono text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                {t.invoice.ncf ?? t.invoice.invoice_number}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Indicador message_count si >1 */}
                      {t.message_count > 1 && (
                        <span className="shrink-0 self-center text-[10px] text-muted-foreground">
                          {t.message_count} msgs
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>

            {/* Pagination */}
            {threads.totalPages > 1 && (
              <div className="border-t border-border p-3">
                <Pagination
                  page={threads.page}
                  totalPages={threads.totalPages}
                  total={threads.total}
                  pageSize={threads.pageSize}
                  baseHref="/mail/inbox"
                  preserveQuery={{
                    q: search || undefined,
                    account: accountId || undefined,
                    unread: unreadOnly ? "1" : undefined,
                  }}
                  itemsLabel="conversaciones"
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

function FilterChip({
  href,
  active,
  label,
}: {
  href: string
  active: boolean
  label: string
}) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-accent")
      }
    >
      {label}
    </Link>
  )
}

function buildHref(params: SearchParamsShape): string {
  const usp = new URLSearchParams()
  if (params.q) usp.set("q", params.q)
  if (params.page) usp.set("page", params.page)
  if (params.account) usp.set("account", params.account)
  if (params.unread) usp.set("unread", params.unread)
  const qs = usp.toString()
  return `/mail/inbox${qs ? `?${qs}` : ""}`
}
