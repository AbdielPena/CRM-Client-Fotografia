"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Send, Mail, MessageCircle, Link2, Copy, Check, X, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { notifyClientFinalDeliveryAction } from "@/server/actions/gallery.actions"

type Result = {
  url: string
  driveLink: string | null
  driveStatus: "ready" | "running" | "unavailable"
  sentEmail: boolean
  sentWhatsapp: boolean
  whatsappLink: string | null
  errors: string[]
}

export function DeliverToClientButton({
  galleryId,
  clientName,
  clientEmail,
  clientPhone,
}: {
  galleryId: string
  clientName: string | null
  clientEmail: string | null
  clientPhone: string | null
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand/90"
      >
        <Send className="h-3.5 w-3.5" />
        Enviar al cliente
      </button>
      {open && (
        <DeliverToClientModal
          galleryId={galleryId}
          clientName={clientName}
          clientEmail={clientEmail}
          clientPhone={clientPhone}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function DeliverToClientModal({
  galleryId,
  clientName,
  clientEmail,
  clientPhone,
  onClose,
}: {
  galleryId: string
  clientName: string | null
  clientEmail: string | null
  clientPhone: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sendEmail, setSendEmail] = useState(!!clientEmail)
  const [sendWhatsapp, setSendWhatsapp] = useState(!!clientPhone)
  const [result, setResult] = useState<Result | null>(null)

  const send = () =>
    start(async () => {
      try {
        const r = await notifyClientFinalDeliveryAction({
          galleryId,
          sendEmail,
          sendWhatsapp,
        })
        setResult(r)
        if (r.errors.length === 0) {
          if (r.sentEmail || r.sentWhatsapp) {
            const parts: string[] = []
            if (r.sentEmail) parts.push("email")
            if (r.sentWhatsapp) parts.push("WhatsApp")
            toast.success(`Enviado por ${parts.join(" y ")}`)
          } else {
            toast.success("Links generados")
          }
          router.refresh()
        } else {
          toast.error("Hubo errores — revisá abajo")
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error inesperado")
      }
    })

  const generateOnly = () =>
    start(async () => {
      try {
        const r = await notifyClientFinalDeliveryAction({
          galleryId,
          sendEmail: false,
          sendWhatsapp: false,
        })
        setResult(r)
        toast.success("Links listos para copiar")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error")
      }
    })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Entregar a {clientName ?? "el cliente"}</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Avisamos al cliente que su entrega final está lista y te damos los links para
                compartirlos manualmente si querés.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!result && (
          <>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Canales
            </p>
            <div className="mb-4 space-y-2">
              <ChannelOption
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={clientEmail}
                enabled={sendEmail}
                onToggle={() => setSendEmail((v) => !v)}
                missingMsg="Cliente sin email"
              />
              <ChannelOption
                icon={<MessageCircle className="h-4 w-4" />}
                label="WhatsApp"
                value={clientPhone}
                enabled={sendWhatsapp}
                onToggle={() => setSendWhatsapp((v) => !v)}
                missingMsg="Cliente sin teléfono"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={generateOnly}
                disabled={pending}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:border-border-strong disabled:opacity-50"
              >
                <Link2 className="mr-1 inline h-3.5 w-3.5" /> Solo mostrar links
              </button>
              <button
                type="button"
                onClick={send}
                disabled={pending || (!sendEmail && !sendWhatsapp)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Enviar y mostrar links
              </button>
            </div>
          </>
        )}

        {result && (
          <ResultPanel result={result} clientName={clientName} onClose={onClose} />
        )}
      </div>
    </div>
  )
}

function ChannelOption({
  icon,
  label,
  value,
  enabled,
  onToggle,
  missingMsg,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
  enabled: boolean
  onToggle: () => void
  missingMsg: string
}) {
  const disabled = !value
  return (
    <label
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        disabled
          ? "cursor-not-allowed border-border bg-muted/30 opacity-60"
          : "cursor-pointer border-border bg-background hover:border-border-strong"
      }`}
    >
      <input
        type="checkbox"
        checked={enabled && !disabled}
        disabled={disabled}
        onChange={onToggle}
        className="h-4 w-4 rounded border-border text-brand"
      />
      <span className="text-muted-foreground">{icon}</span>
      <div className="flex-1">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        <p className="text-[11.5px] text-muted-foreground">{value ?? missingMsg}</p>
      </div>
    </label>
  )
}

function ResultPanel({
  result,
  clientName,
  onClose,
}: {
  result: Result
  clientName: string | null
  onClose: () => void
}) {
  return (
    <div>
      {(result.sentEmail || result.sentWhatsapp) && (
        <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          ✓ Enviado{" "}
          {[
            result.sentEmail ? "por email" : null,
            result.sentWhatsapp ? "por WhatsApp" : null,
          ]
            .filter(Boolean)
            .join(" y ")}{" "}
          a {clientName ?? "el cliente"}.
        </div>
      )}

      {result.errors.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="mb-1 font-medium">No se pudo enviar todo:</p>
          <ul className="ml-4 list-disc">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Compartir manualmente
      </p>
      <div className="space-y-2">
        <CopyRow
          icon={<Link2 className="h-3.5 w-3.5" />}
          label="Descarga (web)"
          value={`${result.url}?entrega=1`}
          openHref={`${result.url}?entrega=1`}
        />
        {result.driveLink && (
          <CopyRow
            icon={<svg className="h-3.5 w-3.5" viewBox="0 0 87.3 78" fill="currentColor"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" opacity=".4"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" opacity=".6"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" opacity=".8"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg>}
            label="Google Drive"
            value={result.driveLink}
          />
        )}
        {!result.driveLink && result.driveStatus === "running" && (
          <div className="flex items-center gap-2 rounded-lg border border-sky-300/50 bg-sky-50 px-3 py-2 text-[12px] text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span>
              Subiendo fotos a Google Drive en este momento. Cuando termine, el cliente
              recibirá el link por email automáticamente y también aparecerá en esta galería.
            </span>
          </div>
        )}
        {!result.driveLink && result.driveStatus === "unavailable" && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
            Google Drive no está conectado — conectalo en Ajustes para respaldar entregas automáticamente.
          </div>
        )}
        {result.whatsappLink && (
          <CopyRow
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            label="WhatsApp manual"
            value={result.whatsappLink}
            openHref={result.whatsappLink}
          />
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

function CopyRow({
  icon,
  label,
  value,
  openHref,
}: {
  icon: React.ReactNode
  label: string
  value: string
  openHref?: string
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-mono text-[11.5px] text-foreground">{value}</p>
      </div>
      {openHref && (
        <a
          href={openHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:border-border-strong"
        >
          Abrir
        </a>
      )}
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-brand-foreground hover:bg-brand/90"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  )
}
