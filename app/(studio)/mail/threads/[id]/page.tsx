import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Paperclip,
  Reply,
  Archive,
  User,
  FolderOpen,
  Receipt,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getMailThreadById } from "@/server/services/mail-thread.service"
import { markMailThreadReadAction } from "@/server/actions/mail-thread.actions"
import { formatDate, formatDateShort } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { ReplyForm } from "./reply-form"
import { ThreadActions } from "./thread-actions"

export const metadata: Metadata = { title: "Conversación · Correo" }

export default async function MailThreadDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()

  const [result, unread] = await Promise.all([
    getMailThreadById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])

  if (!result) notFound()
  const { thread, messages } = result

  // Auto mark-as-read del thread al abrirlo (fire-and-forget, no bloquea render)
  if (thread.unread_count > 0) {
    void markMailThreadReadAction(thread.id).catch((err) => {
      console.warn("[mail-thread-detail] auto markRead failed:", err)
    })
  }

  // Último mensaje inbound — su id es default para "Responder"
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound")
  const replyMessageId = lastInbound?.id ?? null

  return (
    <>
      <AppTopbar
        eyebrow="Correo"
        title={thread.subject ?? "(sin subject)"}
        description={`${thread.message_count} mensaje${thread.message_count !== 1 ? "s" : ""} · ${thread.participants?.length ?? 0} participante${(thread.participants?.length ?? 0) !== 1 ? "s" : ""}`}
        unreadNotifications={unread}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/mail/inbox">
                <ArrowLeft className="mr-1 size-3.5" />
                Inbox
              </Link>
            </Button>
            <ThreadActions threadId={thread.id} />
          </div>
        }
      />

      <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {/* Metadata cross-módulo si existe */}
        {(thread.client || thread.project || thread.invoice) && (
          <section className="sf-card flex flex-wrap items-center gap-2 p-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Vinculado a:
            </span>
            {thread.client && (
              <Link
                href={`/clients/${thread.client.id}`}
                className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-[11px] text-purple-700 hover:bg-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:hover:bg-purple-900"
              >
                <User className="size-3" />
                {thread.client.name}
              </Link>
            )}
            {thread.project && (
              <Link
                href={`/projects/${thread.project.id}`}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] text-blue-700 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
              >
                <FolderOpen className="size-3" />
                {thread.project.name}
              </Link>
            )}
            {thread.invoice && (
              <Link
                href={`/invoices/${thread.invoice.id}`}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-mono text-amber-700 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
              >
                <Receipt className="size-3" />
                {thread.invoice.ncf ?? thread.invoice.invoice_number}
              </Link>
            )}
          </section>
        )}

        {/* Lista de mensajes */}
        <section className="space-y-3">
          {messages.map((msg, i) => {
            const isOutbound = msg.direction === "outbound"
            const ts =
              msg.sent_at ?? msg.received_at ?? msg.created_at ?? null
            const isCollapsed = i < messages.length - 1 && messages.length > 3
            return (
              <article
                key={msg.id}
                className={
                  "sf-card overflow-hidden " +
                  (isOutbound ? "border-l-2 border-l-primary/40" : "")
                }
              >
                {/* Header */}
                <header className="flex items-start justify-between gap-3 border-b border-border bg-muted/30 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={
                        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                        (isOutbound
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground")
                      }
                      aria-hidden
                    >
                      {(msg.from_name ?? msg.from_email ?? "?")
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {msg.from_name ?? msg.from_email}
                        {isOutbound && (
                          <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-normal text-primary">
                            Enviado
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        Para:{" "}
                        {msg.to_recipients
                          ?.map((r) => r.name ?? r.email)
                          .join(", ")}
                        {msg.cc_recipients && msg.cc_recipients.length > 0 && (
                          <>
                            {" · CC: "}
                            {msg.cc_recipients
                              .map((r) => r.name ?? r.email)
                              .join(", ")}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <time
                    dateTime={ts ?? undefined}
                    className="shrink-0 text-[11px] text-muted-foreground"
                    title={ts ? formatDate(new Date(ts)) : undefined}
                  >
                    {ts ? formatDateShort(new Date(ts)) : "—"}
                  </time>
                </header>

                {/* Body */}
                <div className="p-4 text-sm leading-relaxed text-foreground">
                  {msg.body_text ? (
                    <pre className="whitespace-pre-wrap break-words font-sans">
                      {msg.body_text}
                    </pre>
                  ) : msg.snippet ? (
                    <p className="italic text-muted-foreground">
                      {msg.snippet}
                    </p>
                  ) : (
                    <p className="italic text-muted-foreground">(Sin cuerpo)</p>
                  )}
                </div>

                {/* Attachments */}
                {msg.has_attachments && msg.attachments && msg.attachments.length > 0 && (
                  <div className="border-t border-border bg-muted/20 p-3">
                    <p className="mb-2 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Paperclip className="size-3" />
                      Adjuntos ({msg.attachments.length})
                    </p>
                    <ul className="space-y-1">
                      {msg.attachments
                        .filter((a) => !a.is_inline)
                        .map((a) => (
                          <li
                            key={a.id}
                            className="flex items-center justify-between gap-2 rounded bg-card px-2 py-1 text-xs"
                          >
                            <span className="truncate">
                              {a.filename}
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                {formatBytes(a.size_bytes)}
                              </span>
                            </span>
                            <code className="text-[9px] text-muted-foreground">
                              {a.content_type}
                            </code>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                {/* Delivery error (si falló) */}
                {msg.delivery_error && (
                  <div className="border-t border-border bg-red-50 p-3 text-[11px] text-red-700 dark:bg-red-950 dark:text-red-300">
                    Error envío: {msg.delivery_error}
                  </div>
                )}
              </article>
            )
          })}
        </section>

        {/* Reply form */}
        <section className="sf-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Reply className="size-4 text-primary" />
            Responder
          </h3>
          <ReplyForm
            accountId={thread.account?.id ?? ""}
            threadId={thread.id}
            replyToMessageId={replyMessageId}
            defaultTo={
              lastInbound
                ? `${lastInbound.from_name ? `"${lastInbound.from_name}"` : ""} <${lastInbound.from_email}>`
                : ""
            }
            defaultSubject={
              thread.subject?.startsWith("Re:")
                ? thread.subject
                : `Re: ${thread.subject ?? ""}`
            }
            clientId={thread.client_id}
            projectId={thread.project_id}
            invoiceId={thread.invoice_id}
          />
        </section>
      </main>
    </>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
