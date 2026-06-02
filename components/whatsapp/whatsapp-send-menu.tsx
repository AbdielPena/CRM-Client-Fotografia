"use client"

import { useState } from "react"
import { MessageCircle, ChevronDown } from "lucide-react"
import { templatesFor, waLink, type WaVars } from "@/lib/whatsapp/templates"

/**
 * Botón "Enviar por WhatsApp" con popup de plantillas predeterminadas (Fase 1,
 * gratis). Al elegir una, abre WhatsApp con el mensaje ya escrito en formato RD.
 * Solo muestra las plantillas cuyas variables requeridas están presentes.
 */
export function WhatsAppSendMenu({
  phone,
  vars,
  label = "WhatsApp",
  className = "",
  only,
}: {
  phone: string | null | undefined
  vars: WaVars
  label?: string
  className?: string
  /** Limitar a estas plantillas (keys). Si se omite, muestra todas las aplicables. */
  only?: string[]
}) {
  const [open, setOpen] = useState(false)
  let templates = templatesFor(vars)
  if (only && only.length > 0) templates = templates.filter((t) => only.includes(t.key))

  const hasPhone = !!phone && phone.replace(/\D/g, "").length >= 10

  if (!hasPhone) {
    return (
      <span
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-60"
        title="Este cliente no tiene WhatsApp/teléfono registrado"
      >
        <MessageCircle className="h-3.5 w-3.5" /> {label}
      </span>
    )
  }

  const send = (build: (v: WaVars) => string) => {
    const link = waLink(phone, build(vars))
    if (link) window.open(link, "_blank", "noopener,noreferrer")
    setOpen(false)
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
      >
        <MessageCircle className="h-3.5 w-3.5" /> {label}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Mensaje predeterminado
            </p>
            {templates.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No hay plantillas aplicables aquí.
              </p>
            ) : (
              templates.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => send(t.build)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-emerald-50"
                >
                  <MessageCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
                  {t.label}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
