"use client"

import * as React from "react"
import { useTransition } from "react"
import { toast } from "sonner"
import { Heart, Copy, Check, MessageCircle, Save } from "lucide-react"

import { updateMotherDedicationAction } from "@/server/actions/gallery.actions"

/**
 * Editor de la "dedicatoria de la madre" (aparece en la entrega). El estudio la
 * escribe aquí, o comparte el link para que la MAMÁ la escriba ella misma.
 */
export function MotherDedicationCard({
  galleryId,
  publicToken,
  initialMessage,
  initialFrom,
}: {
  galleryId: string
  publicToken: string | null
  initialMessage: string
  initialFrom: string
}) {
  const [message, setMessage] = React.useState(initialMessage)
  const [from, setFrom] = React.useState(initialFrom)
  const [pending, start] = useTransition()
  const [copied, setCopied] = React.useState(false)

  const momLink = publicToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/g/${publicToken}/dedicatoria`
    : null

  const dirty =
    message.trim() !== initialMessage.trim() || from.trim() !== initialFrom.trim()

  const save = () =>
    start(async () => {
      try {
        await updateMotherDedicationAction({ galleryId, message, from })
        toast.success("Dedicatoria guardada")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error")
      }
    })

  const copyLink = () => {
    if (!momLink) return
    navigator.clipboard.writeText(momLink)
    setCopied(true)
    toast.success("Link copiado")
    setTimeout(() => setCopied(false), 2000)
  }

  const waHref = momLink
    ? `https://wa.me/?text=${encodeURIComponent(`Escríbele una dedicatoria a tu hija para su galería de fotos 💛: ${momLink}`)}`
    : null

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
        <Heart className="h-3.5 w-3.5" /> Dedicatoria de la mamá
      </p>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Un mensaje que aparece en la entrega. Escríbelo tú, o comparte el link para
        que la mamá lo escriba ella misma.
      </p>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Hija mía, hoy celebramos…"
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-brand focus:outline-none"
      />
      <input
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        maxLength={120}
        placeholder="Firma (ej. Con amor, Mamá)"
        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-[12.5px] text-foreground focus:border-brand focus:outline-none"
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={pending || !dirty}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" /> {pending ? "Guardando…" : "Guardar"}
        </button>
        {momLink && (
          <button
            onClick={copyLink}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted/50"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Link para la mamá
          </button>
        )}
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#25D366] px-3 text-xs font-semibold text-white hover:bg-[#1eb858]"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Enviar a la mamá
          </a>
        )}
      </div>
    </div>
  )
}
