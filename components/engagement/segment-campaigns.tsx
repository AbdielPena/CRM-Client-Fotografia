"use client"

import { useState, useTransition } from "react"
import { Users, Send, X, Loader2, Megaphone } from "lucide-react"
import { toast } from "sonner"

import { SEGMENT_LIST, SEGMENT_BY_KEY } from "@/lib/engagement/segments"
import {
  previewSegmentAction,
  sendSegmentCampaignAction,
} from "@/server/actions/engagement-segments.actions"

export function SegmentCampaigns({ counts }: { counts: Record<string, number> }) {
  const [open, setOpen] = useState<string | null>(null) // segment key
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [pending, start] = useTransition()

  const openComposer = (key: string) => {
    setOpen(key)
    setSubject("")
    setBody("<p>Hola {{client_name}},</p>\n<p></p>\n<p>— {{studio_name}}</p>")
    setPreviewCount(null)
    start(async () => {
      const r = await previewSegmentAction(key)
      setPreviewCount(r.ok ? (r.count ?? 0) : 0)
    })
  }

  const send = () => {
    if (!open) return
    if (!subject.trim() || !body.trim()) {
      toast.error("Completa asunto y mensaje")
      return
    }
    const seg = SEGMENT_BY_KEY[open]
    if (!confirm(`¿Enviar esta campaña a ${previewCount ?? "los"} cliente(s) del segmento "${seg?.label}"?`)) return
    start(async () => {
      const r = await sendSegmentCampaignAction(open, subject, body)
      if (r.ok) {
        toast.success(`Campaña enviada a ${r.sent}/${r.total} cliente(s)`)
        setOpen(null)
      } else {
        toast.error(r.message ?? "Error")
      }
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-foreground">Segmentos y campañas</h2>
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        Envía una campaña puntual por email a un grupo de clientes. Variables disponibles:{" "}
        <code>{"{{client_name}}"}</code>, <code>{"{{studio_name}}"}</code>.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {SEGMENT_LIST.map((s) => {
          const n = counts[s.key] ?? 0
          return (
            <div key={s.key} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xl">{s.emoji}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  <Users className="h-3 w-3" /> {n}
                </span>
              </div>
              <p className="mt-2 text-[13px] font-semibold text-foreground">{s.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{s.description}</p>
              <button
                type="button"
                onClick={() => openComposer(s.key)}
                disabled={n === 0}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11.5px] font-medium text-foreground transition-colors hover:border-brand disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" /> Enviar campaña
              </button>
            </div>
          )
        })}
      </div>

      {/* Composer modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !pending && setOpen(null)}>
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="text-lg">{SEGMENT_BY_KEY[open]?.emoji}</span>
                Campaña — {SEGMENT_BY_KEY[open]?.label}
              </h3>
              <button type="button" onClick={() => setOpen(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-[12px] text-muted-foreground">
              {previewCount === null ? (
                <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Contando destinatarios…</span>
              ) : (
                <>Se enviará a <strong>{previewCount}</strong> cliente(s) con email en este segmento.</>
              )}
            </p>
            <label className="mb-1 block text-[12px] font-medium text-foreground">Asunto</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej. Nuevas sesiones disponibles ✨"
              className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
            />
            <label className="mb-1 block text-[12px] font-medium text-foreground">Mensaje (HTML)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="mb-3 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground focus:border-brand focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setOpen(null)} disabled={pending} className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-medium text-foreground hover:bg-muted disabled:opacity-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={send}
                disabled={pending || previewCount === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar campaña
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
