"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Copy, Check, MessageCircle, Pencil, Link as LinkIcon } from "lucide-react"

import { renderWaMessage, DEFAULT_PRINT_WA_MESSAGE } from "@/lib/share/wa-message"

/**
 * Botón para enviarle al cliente el link donde elige sus impresiones, directo
 * por WhatsApp (o copiar el link / el mensaje). Usa la plantilla editable de
 * Ajustes → WhatsApp ({{cliente}}, {{galeria}}, {{link}}).
 */
export function PrintWhatsAppShare({
  token,
  galleryName,
  clientName = null,
  clientPhone = null,
  template,
}: {
  token: string | null
  galleryName: string
  clientName?: string | null
  clientPhone?: string | null
  template?: string
}) {
  const [origin, setOrigin] = React.useState("")
  React.useEffect(() => setOrigin(window.location.origin), [])

  const link = token && origin ? `${origin}/g/${token}` : null
  const firstName = (clientName ?? "").trim().split(/\s+/)[0] || ""
  const waPhone = (clientPhone ?? "").replace(/\D/g, "").replace(/^(\d{10})$/, "1$1")
  const message = renderWaMessage(template || DEFAULT_PRINT_WA_MESSAGE, {
    cliente: firstName,
    galeria: galleryName,
    link: link ?? "",
  })

  const [linkCopied, setLinkCopied] = React.useState(false)
  const [msgCopied, setMsgCopied] = React.useState(false)
  const copy = (
    value: string,
    set: (v: boolean) => void,
    label: string,
  ) => {
    navigator.clipboard.writeText(value)
    set(true)
    toast.success(`${label} copiado`)
    setTimeout(() => set(false), 2000)
  }

  if (!link) {
    return (
      <p className="mt-4 border-t border-border/60 pt-4 text-[11.5px] text-muted-foreground">
        Genera el link público de la galería (pestaña Compartir) para enviarle al cliente
        el enlace de selección de impresiones.
      </p>
    )
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        Enviar al cliente para que elija sus impresiones
      </p>

      {/* Link copiable */}
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-[11.5px] text-foreground"
        />
        <button
          onClick={() => copy(link, setLinkCopied, "Link")}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-2.5 text-[11.5px] font-medium text-brand-foreground hover:bg-brand/90"
        >
          {linkCopied ? <Check className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
          {linkCopied ? "Copiado" : "Copiar link"}
        </button>
      </div>

      {/* Mensaje listo para enviar */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Mensaje para el cliente
          </span>
          <button
            onClick={() => copy(message, setMsgCopied, "Mensaje")}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-white dark:border-emerald-500/40 dark:bg-transparent dark:text-emerald-300"
          >
            {msgCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {msgCopied ? "Copiado" : "Copiar mensaje"}
          </button>
        </div>
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground">
          {message}
        </p>
        <Link
          href="/settings/whatsapp"
          className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          <Pencil className="h-3 w-3" /> Editar mensaje
        </Link>
      </div>

      {/* Enviar directo por WhatsApp */}
      {waPhone ? (
        <a
          href={`https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-3 text-xs font-semibold text-white hover:bg-[#1eb858]"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Enviar por WhatsApp
        </a>
      ) : (
        <p className="text-[11.5px] text-muted-foreground">
          Agrega el teléfono del cliente para enviarle el link directo por WhatsApp.
        </p>
      )}
    </div>
  )
}
