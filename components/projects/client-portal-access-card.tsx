"use client"

import { useState } from "react"
import { Copy, Check, ExternalLink, KeyRound, Eye } from "lucide-react"

/**
 * Acceso del cliente al portal — visible en el detalle del proyecto.
 * Muestra email + código de acceso (copiables), el link de login y el
 * botón "Ver como el cliente" (magic link admin vía /api/portal/impersonate).
 */
export function ClientPortalAccessCard({
  clientId,
  clientEmail,
  accessCode,
  portalUrl,
}: {
  clientId: string
  clientEmail: string | null
  accessCode: string | null
  portalUrl: string
}) {
  return (
    <div className="sf-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Portal del cliente</h2>
        </div>
        <a
          href={`/api/portal/impersonate?clientId=${clientId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-brand-foreground hover:bg-brand/90"
          title="Abre el portal con la sesión de este cliente (solo funciona desde tu cuenta)"
        >
          <Eye className="h-3 w-3" /> Ver como el cliente
        </a>
      </div>

      <div className="space-y-2">
        <FieldRow label="Email" value={clientEmail ?? "— sin email —"} copyable={!!clientEmail} />
        <FieldRow
          label="Código de acceso"
          value={accessCode ?? "— se genera al enviar acceso —"}
          copyable={!!accessCode}
          mono
        />
        <FieldRow label="Link de login" value={portalUrl} copyable openable />
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        El cliente entra con su email + código. Desde el portal ve sus proyectos,
        galerías, facturas, contratos y entregas.
      </p>
    </div>
  )
}

function FieldRow({
  label,
  value,
  copyable = false,
  openable = false,
  mono = false,
}: {
  label: string
  value: string
  copyable?: boolean
  openable?: boolean
  mono?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={`truncate text-[12px] text-foreground ${mono ? "font-mono tracking-wider" : ""}`}
        >
          {value}
        </p>
      </div>
      {openable && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-border p-1 text-muted-foreground hover:border-border-strong"
          title="Abrir"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {copyable && (
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-border p-1 text-muted-foreground hover:border-border-strong"
          title="Copiar"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </div>
  )
}
