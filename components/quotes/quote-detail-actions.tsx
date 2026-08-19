"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Ban, Check, Copy, Mail, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import {
  cancelQuoteAction,
  resendQuoteAction,
} from "@/server/actions/booking-quote.actions"

/**
 * Gestionar una cotización desde su detalle.
 *
 * Copiar el link para mandarlo por WhatsApp, reenviarle el correo al cliente
 * (se le perdió, cambió de correo, o simplemente hay que recordárselo) y
 * anularla si no llegó a nada.
 *
 * Una vez ACEPTADA ya hay contrato, factura y sesión: desde aquí no se toca.
 */
export function QuoteDetailActions({
  quoteId,
  url,
  clientName,
  clientEmail,
  editable,
}: {
  quoteId: string
  url: string
  clientName: string
  clientEmail: string
  editable: boolean
}) {
  const router = useRouter()
  const [copiado, setCopiado] = React.useState(false)
  const [ocupado, setOcupado] = React.useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      toast.success("Link copiado")
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  const wa = () => {
    const texto = `Hola ${clientName.split(/\s+/)[0] ?? ""}, aquí está tu cotización: ${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank")
  }

  const reenviar = async () => {
    if (!confirm(`¿Reenviarle el correo de la cotización a ${clientEmail}?`))
      return
    setOcupado(true)
    try {
      const r = await resendQuoteAction(quoteId)
      if (!r.ok) toast.error(r.error)
      else {
        toast.success(`Correo reenviado a ${r.sentTo}`)
        router.refresh()
      }
    } finally {
      setOcupado(false)
    }
  }

  const anular = async () => {
    if (
      !confirm(
        "¿Anular esta cotización? Queda el registro de que se cotizó, pero el link deja de servir.",
      )
    )
      return
    setOcupado(true)
    try {
      const r = await cancelQuoteAction(quoteId)
      if (!r.ok) toast.error(r.error)
      else {
        toast.success("Cotización anulada")
        router.refresh()
      }
    } finally {
      setOcupado(false)
    }
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={copiar} className={btn}>
        {copiado ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        Copiar link
      </button>
      {editable && (
        <>
          <button type="button" onClick={wa} className={btn}>
            <MessageCircle className="h-3.5 w-3.5" />
            Enviar por WhatsApp
          </button>
          <button
            type="button"
            onClick={reenviar}
            disabled={ocupado}
            className={btn}
          >
            <Mail className="h-3.5 w-3.5" />
            Reenviar el correo
          </button>
          <button
            type="button"
            onClick={anular}
            disabled={ocupado}
            className={`${btn} text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30`}
          >
            <Ban className="h-3.5 w-3.5" />
            Anular
          </button>
        </>
      )}
    </div>
  )
}
