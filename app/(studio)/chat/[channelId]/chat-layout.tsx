"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import {
  Hash,
  Send,
  Loader2,
  Smile,
  MessageCircle,
  Lock,
} from "lucide-react"

import {
  markChannelReadAction,
  sendMessageAction,
  toggleReactionAction,
} from "@/server/actions/chat.actions"
import type {
  ChatChannel,
  ChatMessage,
} from "@/server/services/chat.service"
import { Button } from "@/components/ui/button"

const QUICK_EMOJIS = ["👍", "❤️", "🎉", "😂", "👀", "✅"]

export function ChatLayout({
  currentChannel,
  channels,
  messages,
  reactions,
  members,
  currentUserId,
  isMember,
}: {
  currentChannel: ChatChannel
  channels: ChatChannel[]
  messages: ChatMessage[]
  reactions: Record<
    string,
    Array<{ emoji: string; user_ids: string[]; count: number }>
  >
  members: Array<{ userId: string; email: string; name: string }>
  currentUserId: string
  isMember: boolean
}) {
  const [input, setInput] = useState("")
  const [isPending, startTransition] = useTransition()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll al fondo al cargar y al añadir mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  // Mark channel read al cargar
  useEffect(() => {
    void markChannelReadAction(currentChannel.id)
  }, [currentChannel.id])

  function userName(userId: string): string {
    return members.find((m) => m.userId === userId)?.name ?? "Usuario"
  }

  function userInitial(userId: string): string {
    return userName(userId).charAt(0).toUpperCase()
  }

  async function handleSend() {
    const content = input.trim()
    if (!content) return

    const formData = new FormData()
    formData.append("channelId", currentChannel.id)
    formData.append("content", content)

    setInput("")
    startTransition(async () => {
      const res = await sendMessageAction(formData)
      if (!res.ok) {
        setInput(content) // restore on error
      }
    })
  }

  async function handleReact(messageId: string, emoji: string) {
    startTransition(async () => {
      await toggleReactionAction(messageId, emoji)
    })
  }

  function getChannelIcon(c: ChatChannel) {
    if (c.kind === "dm") return MessageCircle
    if (c.kind === "project") return Lock
    return Hash
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-0 overflow-hidden border-t border-border">
      {/* Sidebar de canales */}
      <aside className="border-r border-border bg-muted/30 p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Canales
          </h3>
        </div>
        <ul className="space-y-0.5">
          {channels.map((c) => {
            const Icon = getChannelIcon(c)
            const isCurrent = c.id === currentChannel.id
            return (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className={
                    "flex items-center gap-2 truncate rounded-lg px-2 py-1.5 text-sm " +
                    (isCurrent
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground")
                  }
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{c.name}</span>
                  {c.message_count > 0 && (
                    <span className="ml-auto text-[9px] tabular-nums text-muted-foreground">
                      {c.message_count}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="mt-4 border-t border-border pt-3">
          <Button asChild size="sm" variant="outline" fullWidth>
            <Link href="/chat/new">
              <Hash className="mr-1 size-3" />
              Nuevo canal
            </Link>
          </Button>
        </div>
      </aside>

      {/* Main chat */}
      <main className="flex h-[calc(100vh-140px)] flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          {!isMember ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No eres miembro de este canal.
            </div>
          ) : messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <MessageCircle className="mx-auto size-10 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-medium">
                Inicia la conversación
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sé el primero en saludar a tu equipo en{" "}
                <strong>{currentChannel.name}</strong>.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {messages.map((m, idx) => {
                const prev = messages[idx - 1]
                const showAvatar =
                  !prev ||
                  prev.author_id !== m.author_id ||
                  new Date(m.created_at).getTime() -
                    new Date(prev.created_at).getTime() >
                    5 * 60 * 1000
                const isOwn = m.author_id === currentUserId
                const msgReactions = reactions[m.id] ?? []

                if (m.content_type === "system") {
                  return (
                    <li
                      key={m.id}
                      className="text-center text-[10px] italic text-muted-foreground"
                    >
                      {m.content} · {formatTime(m.created_at)}
                    </li>
                  )
                }

                return (
                  <li
                    key={m.id}
                    className={"group flex gap-3 " + (showAvatar ? "" : "pl-11")}
                  >
                    {showAvatar && (
                      <span
                        className={
                          "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                          (isOwn
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground")
                        }
                      >
                        {userInitial(m.author_id)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      {showAvatar && (
                        <div className="mb-0.5 flex items-baseline gap-2">
                          <span className="text-sm font-semibold">
                            {userName(m.author_id)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(m.created_at)}
                          </span>
                          {m.is_edited && (
                            <span className="text-[10px] italic text-muted-foreground">
                              (editado)
                            </span>
                          )}
                        </div>
                      )}
                      <div className="text-sm whitespace-pre-wrap">
                        {m.content}
                      </div>

                      {/* Reactions */}
                      {msgReactions.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {msgReactions.map((r) => {
                            const isOwnReact = r.user_ids.includes(currentUserId)
                            return (
                              <button
                                key={r.emoji}
                                onClick={() => handleReact(m.id, r.emoji)}
                                className={
                                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors " +
                                  (isOwnReact
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-input bg-background hover:bg-accent")
                                }
                              >
                                <span>{r.emoji}</span>
                                <span className="tabular-nums">{r.count}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* Quick reactions on hover */}
                      <div className="mt-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        {QUICK_EMOJIS.map((e) => (
                          <button
                            key={e}
                            onClick={() => handleReact(m.id, e)}
                            className="rounded p-1 text-xs hover:bg-accent"
                            title={`Reaccionar ${e}`}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                )
              })}
              <div ref={messagesEndRef} />
            </ul>
          )}
        </div>

        {/* Composer */}
        {isMember && (
          <div className="border-t border-border bg-background p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSend()
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                rows={1}
                placeholder={`Mensaje a ${currentChannel.name}`}
                className="flex-1 resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                disabled={isPending}
                style={{ maxHeight: "120px" }}
              />
              <Button
                type="submit"
                disabled={isPending || !input.trim()}
                size="sm"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </form>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Enter para enviar · Shift+Enter para nueva línea
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString("es-DO", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  return d.toLocaleString("es-DO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
