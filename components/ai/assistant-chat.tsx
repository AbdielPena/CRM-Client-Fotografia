"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Bot, User, UserCog } from "lucide-react"
import { sendAssistantMessageAction } from "@/server/actions/ai-assistant.actions"

interface Msg {
  role: "user" | "assistant"
  text: string
  handoff?: boolean
}

export function AssistantChat({ greeting }: { greeting: string }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: greeting },
  ])
  const [input, setInput] = useState("")
  const [pending, setPending] = useState(false)
  const [convId, setConvId] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, pending])

  const send = async () => {
    const text = input.trim()
    if (!text || pending) return
    setInput("")
    setMessages((m) => [...m, { role: "user", text }])
    setPending(true)
    try {
      const r = (await sendAssistantMessageAction(convId, text)) as {
        reply?: string
        conversationId?: string
        handoff?: boolean
        error?: string
      }
      if (r?.conversationId) setConvId(r.conversationId)
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: r?.error ? `⚠️ ${r.error}` : r?.reply || "…",
          handoff: r?.handoff,
        },
      ])
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "⚠️ Error de conexión. Inténtalo de nuevo." },
      ])
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="sf-card flex h-[560px] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
        <Bot className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-foreground">Probar asistente</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Escribe como si fueras un cliente
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <span
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                m.role === "user" ? "bg-brand text-brand-foreground" : "bg-card border border-border text-brand"
              }`}
            >
              {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </span>
            <div
              className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                m.role === "user"
                  ? "bg-brand text-brand-foreground"
                  : "border border-border bg-card text-foreground"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
              {m.handoff && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                  <UserCog className="h-3 w-3" /> Escalado a un humano
                </p>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-brand">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <div className="rounded-2xl border border-border bg-card px-3.5 py-2.5">
              <span className="flex gap-1">
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.2s]" />
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.1s]" />
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Escribe un mensaje…"
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !input.trim()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
