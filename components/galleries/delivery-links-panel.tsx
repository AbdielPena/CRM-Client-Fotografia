"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Eye,
  Download,
  BookOpen,
  Cloud,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
  Pencil,
} from "lucide-react"

import { renderWaMessage, DEFAULT_DELIVERY_WA_MESSAGE } from "@/lib/share/wa-message"

/**
 * Panel único con TODOS los enlaces de la entrega final:
 *   1. Galería online (ver en el navegador)  → /g/{token}
 *   2. Descarga (ZIP al teléfono)            → /g/{token}?entrega=1
 *   3. Álbum Experience (libro digital)      → /g/{token}?libro=1
 *   4. Google Drive (carpeta de respaldo)    → web_view_link
 * + mensaje de WhatsApp editable (con {{link_web}} y {{link_drive}}).
 *
 * Se usa en la pestaña "Entrega" (principal) y dentro de "Compartir" para no
 * mantener dos implementaciones de lo mismo.
 */
export function DeliveryLinksPanel({
  galleryName,
  token,
  bookEnabled = false,
  bookDisplayMode = "classic",
  driveLink = null,
  clientName = null,
  clientPhone = null,
  waDeliveryTemplate,
}: {
  galleryName: string
  token: string | null
  bookEnabled?: boolean
  bookDisplayMode?: string
  driveLink?: string | null
  clientName?: string | null
  clientPhone?: string | null
  waDeliveryTemplate?: string
}) {
  // El origin se resuelve tras montar (evita mismatch de hidratación y funciona
  // con cualquier dominio, incluida la app de escritorio).
  const [origin, setOrigin] = React.useState("")
  React.useEffect(() => setOrigin(window.location.origin), [])

  const publicUrl = token && origin ? `${origin}/g/${token}` : null
  const deliveryWebUrl = publicUrl ? `${publicUrl}?entrega=1` : null
  const bookUrl =
    publicUrl && bookEnabled && bookDisplayMode !== "classic"
      ? `${publicUrl}?libro=1`
      : null

  const firstName = (clientName ?? "").trim().split(/\s+/)[0] || ""
  const waPhone = (clientPhone ?? "").replace(/\D/g, "").replace(/^(\d{10})$/, "1$1")
  const msgEntrega = renderWaMessage(waDeliveryTemplate || DEFAULT_DELIVERY_WA_MESSAGE, {
    cliente: firstName,
    galeria: galleryName,
    link_web: deliveryWebUrl ?? "",
    link_drive: driveLink ?? "",
  })

  const [msgCopied, setMsgCopied] = React.useState(false)
  const copyMsg = () => {
    navigator.clipboard.writeText(msgEntrega)
    setMsgCopied(true)
    toast.success("Mensaje copiado")
    setTimeout(() => setMsgCopied(false), 2000)
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand">
          <ExternalLink className="size-5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Enlaces de la entrega</h3>
          <p className="text-xs text-muted-foreground">
            Todos los links para compartir la entrega final con el cliente.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <LinkRow
          icon={<Eye className="size-4" />}
          label="Galería online"
          hint="El cliente ve sus fotos en el navegador."
          url={publicUrl}
          emptyHint="Genera el link público en la pestaña Compartir."
        />
        <LinkRow
          icon={<Download className="size-4" />}
          label="Descarga (ZIP)"
          hint="Descarga todas las fotos a su teléfono/PC en un ZIP."
          url={deliveryWebUrl}
          emptyHint="Genera el link público en la pestaña Compartir."
        />
        <LinkRow
          icon={<BookOpen className="size-4" />}
          label="Álbum Experience"
          hint="Álbum digital interactivo (libro que se hojea)."
          url={bookUrl}
          emptyHint={
            !token
              ? "Genera el link público en la pestaña Compartir."
              : 'Habilita el Luxury Book abajo (modo "Libro" o "Ambos").'
          }
        />
        <LinkRow
          icon={<Cloud className="size-4" />}
          label="Google Drive"
          hint="Carpeta de respaldo con las fotos en alta resolución."
          url={driveLink}
          emptyHint="Se crea al respaldar la entrega en Google Drive (panel de abajo)."
        />
      </div>

      {/* Mensaje de WhatsApp con ambos links, listo para enviar/copiar. */}
      {deliveryWebUrl && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Mensaje de entrega para el cliente
            </span>
            <button
              onClick={copyMsg}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-white dark:border-emerald-500/40 dark:bg-transparent dark:text-emerald-300"
            >
              {msgCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {msgCopied ? "Copiado" : "Copiar mensaje"}
            </button>
          </div>
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground">
            {msgEntrega}
          </p>
          <Link
            href="/settings/whatsapp"
            className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            <Pencil className="h-3 w-3" /> Editar mensaje (con {"{{link_web}}"} y{" "}
            {"{{link_drive}}"})
          </Link>
        </div>
      )}

      {/* Enviar la entrega directo por WhatsApp al cliente. */}
      {waPhone && deliveryWebUrl ? (
        <a
          href={`https://wa.me/${waPhone}?text=${encodeURIComponent(msgEntrega)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-3 text-xs font-semibold text-white hover:bg-[#1eb858]"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Enviar entrega por WhatsApp
        </a>
      ) : (
        !waPhone && (
          <p className="text-[11.5px] text-muted-foreground">
            Agrega el teléfono del cliente para enviar la entrega directo por WhatsApp.
          </p>
        )
      )}
    </div>
  )
}

/** Fila de un enlace: icono + etiqueta + input copiable + botón abrir. */
function LinkRow({
  icon,
  label,
  hint,
  url,
  emptyHint,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  url: string | null
  emptyHint: string
}) {
  const [copied, setCopied] = React.useState(false)
  const copy = () => {
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success(`${label} copiado`)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <span
          className={
            "grid size-7 shrink-0 place-items-center rounded-lg " +
            (url ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground")
          }
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-foreground">{label}</p>
          <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
        </div>
      </div>

      {url ? (
        <div className="mt-2 flex gap-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-[11.5px] text-foreground"
          />
          <button
            onClick={copy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-2.5 text-[11.5px] font-medium text-brand-foreground hover:bg-brand/90"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11.5px] font-medium text-foreground hover:bg-muted/50"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Abrir
          </a>
        </div>
      ) : (
        <p className="mt-1.5 pl-9 text-[11px] italic text-muted-foreground">{emptyHint}</p>
      )}
    </div>
  )
}
