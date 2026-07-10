"use client"

import * as React from "react"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PackageCheck, Loader2, MessageCircle, CheckCircle2 } from "lucide-react"

import { notifyPrintsReadyAction } from "@/server/actions/print.actions"
import { renderWaMessage, DEFAULT_PRINTS_READY_WA_MESSAGE } from "@/lib/share/wa-message"

/**
 * Botón del estudio para avisar al cliente que sus IMPRESIONES están listas para
 * retirar. Manda el correo (`prints_ready`) + WhatsApp automático si el canal
 * está conectado; además ofrece un enlace wa.me para enviarlo a mano ya mismo.
 */
export function PrintReadyButton({
  galleryId,
  galleryName,
  clientName = null,
  clientPhone = null,
  printReadyAt = null,
  template,
}: {
  galleryId: string
  galleryName: string
  clientName?: string | null
  clientPhone?: string | null
  printReadyAt?: string | null
  template?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [readyAt, setReadyAt] = React.useState<string | null>(printReadyAt)

  const firstName = (clientName ?? "").trim().split(/\s+/)[0] || ""
  const waPhone = (clientPhone ?? "").replace(/\D/g, "").replace(/^(\d{10})$/, "1$1")
  const message = renderWaMessage(template || DEFAULT_PRINTS_READY_WA_MESSAGE, {
    cliente: firstName,
    galeria: galleryName,
  })

  const fmt = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString("es-DO", {
        timeZone: "America/Santo_Domingo",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    } catch {
      return ""
    }
  }

  const notify = () =>
    start(async () => {
      const r = await notifyPrintsReadyAction(galleryId)
      if (r.ok) {
        toast.success(
          r.waSent
            ? "Aviso enviado por correo y WhatsApp"
            : "Aviso enviado por correo",
        )
        setReadyAt(new Date().toISOString())
        router.refresh()
      } else {
        toast.error(r.message ?? "No se pudo enviar el aviso")
      }
    })

  return (
    <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        Impresiones listas para retirar
      </p>
      {readyAt && (
        <p className="inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Avisado el {fmt(readyAt)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={notify}
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PackageCheck className="h-3.5 w-3.5" />
          )}
          {readyAt ? "Volver a avisar" : "Avisar al cliente (correo + WhatsApp)"}
        </button>
        {waPhone && (
          <a
            href={`https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-[12.5px] font-semibold text-white hover:bg-[#1eb858]"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp a mano
          </a>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Envía el correo ahora. El WhatsApp automático se activa cuando conectes el
        canal (Meta); mientras tanto usa “WhatsApp a mano”.
      </p>
    </div>
  )
}
