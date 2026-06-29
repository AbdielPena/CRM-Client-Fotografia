"use client"

import * as React from "react"
import { useTransition } from "react"
import { toast } from "sonner"
import { MessageCircle, RotateCcw, Save } from "lucide-react"

import { updateSelectionWaMessageAction } from "@/server/actions/share-message.actions"
import {
  DEFAULT_SELECTION_WA_MESSAGE,
  renderWaMessage,
} from "@/lib/share/wa-message"

export function SelectionMessageEditor({ initial }: { initial: string }) {
  const [text, setText] = React.useState(initial)
  const [pending, startTransition] = useTransition()

  const preview = renderWaMessage(text, {
    cliente: "María",
    galeria: "Quinceañera de María",
    link: "https://my.abbypixel.com/g/abc123",
  })

  const dirty = text.trim() !== initial.trim()

  const save = () =>
    startTransition(async () => {
      try {
        await updateSelectionWaMessageAction(text)
        toast.success("Mensaje guardado — se usará en todas las galerías")
      } catch {
        toast.error("No se pudo guardar el mensaje")
      }
    })

  const insertVar = (v: string) => setText((t) => `${t}${t.endsWith(" ") || t === "" ? "" : " "}${v}`)

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-semibold text-foreground">
          Mensaje de WhatsApp — Selección
        </h2>
      </div>
      <p className="mb-3 text-[12px] text-muted-foreground">
        Este es el mensaje que se arma al compartir la galería de selección (en el CRM
        y en la app de escritorio). Lo editás acá una vez y se actualiza en todas las
        galerías.
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">Variables:</span>
        {["{{cliente}}", "{{galeria}}", "{{link}}"].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => insertVar(v)}
            className="rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-foreground hover:border-border-strong"
          >
            {v}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        placeholder={DEFAULT_SELECTION_WA_MESSAGE}
      />

      {/* Vista previa */}
      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Vista previa
        </p>
        <p className="whitespace-pre-wrap text-[13px] text-foreground">{preview}</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={save}
          disabled={pending || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" /> {pending ? "Guardando…" : "Guardar mensaje"}
        </button>
        <button
          onClick={() => setText(DEFAULT_SELECTION_WA_MESSAGE)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restaurar default
        </button>
      </div>
    </div>
  )
}
