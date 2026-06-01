"use client"

import { useState } from "react"
import { Check, Copy, MessageCircle, ExternalLink, LinkIcon, FileSignature } from "lucide-react"

interface ShareWithClientPanelProps {
  portalUrl: string
  accessCode: string
  clientName: string | null
  clientWhatsapp: string | null
  contractSignUrl: string | null
  studioName?: string
}

function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement("textarea")
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
    }
    setCopiedKey(key)
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000)
  }
  return { copiedKey, copy }
}

export function ShareWithClientPanel({
  portalUrl,
  accessCode,
  clientName,
  clientWhatsapp,
  contractSignUrl,
  studioName = "tu fotógrafo",
}: ShareWithClientPanelProps) {
  const { copiedKey, copy } = useCopy()

  const firstName = clientName?.split(" ")[0] ?? "Hola"
  const waMessage = `¡Hola ${firstName}! 📸 Tu sesión con ${studioName} fue confirmada. Aquí puedes ver todos los detalles, tu contrato y tus fotos cuando estén listas:\n\n${portalUrl}`
  const waNumber = clientWhatsapp?.replace(/\D/g, "") ?? ""
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`
    : `https://wa.me/?text=${encodeURIComponent(waMessage)}`

  return (
    <section className="sf-card p-5 border-emerald-200 bg-emerald-50/50 dark:bg-emerald-500/5">
      <div className="flex items-start gap-2 mb-1">
        <LinkIcon className="h-4 w-4 text-emerald-600 mt-0.5" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Compartir con el cliente
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Si el correo no llega, comparte este enlace por WhatsApp. El cliente
            ve su sesión, contrato, facturas y galería sin necesidad de contraseña.
          </p>
        </div>
      </div>

      {/* Link del portal (el "book" completo) */}
      <div className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
          Enlace del portal (acceso completo)
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg bg-card border border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
            {portalUrl}
          </code>
          <button
            type="button"
            onClick={() => copy("portal", portalUrl)}
            title="Copiar enlace"
            className="flex-shrink-0 rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copiedKey === "portal" ? (
              <Check className="h-4 w-4 text-emerald-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir en nueva pestaña"
            className="flex-shrink-0 rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Código de acceso:{" "}
          <button
            type="button"
            onClick={() => copy("code", accessCode)}
            className="font-mono font-semibold text-foreground hover:text-brand"
            title="Copiar código"
          >
            {accessCode}
            {copiedKey === "code" && (
              <span className="ml-1 text-emerald-600">✓</span>
            )}
          </button>
        </p>
      </div>

      {/* Link de firma del contrato */}
      {contractSignUrl && (
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
            Enlace para firmar el contrato
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-card border border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
              {contractSignUrl}
            </code>
            <button
              type="button"
              onClick={() => copy("contract", contractSignUrl)}
              title="Copiar enlace"
              className="flex-shrink-0 rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {copiedKey === "contract" ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <FileSignature className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* CTA WhatsApp */}
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
      >
        <MessageCircle className="h-4 w-4" />
        {waNumber ? "Enviar por WhatsApp" : "Abrir WhatsApp con el mensaje"}
      </a>
    </section>
  )
}
