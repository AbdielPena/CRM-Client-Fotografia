"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MessageCircle, Check, Copy, Loader2, Power, ChevronDown } from "lucide-react"
import { toast } from "sonner"

import {
  saveWhatsAppBotConnectionAction,
  toggleWhatsAppBotAction,
} from "@/server/actions/ai-assistant.actions"

interface Props {
  webhookUrl: string
  connection: {
    connected: boolean
    status: string
    phoneNumberId: string | null
    businessAccountId: string | null
    verifyToken: string | null
  }
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"

export function WhatsAppBotConnection({ webhookUrl, connection }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [showForm, setShowForm] = useState(!connection.connected)
  const [showGuide, setShowGuide] = useState(false)
  const [verifyToken, setVerifyToken] = useState(connection.verifyToken)

  const onSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const r = await saveWhatsAppBotConnectionAction(fd)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success("Número del bot conectado")
      if (r.verifyToken) setVerifyToken(r.verifyToken)
      setShowForm(false)
      router.refresh()
    })
  }

  const onToggle = () => {
    const enable = connection.status === "disabled"
    start(async () => {
      const r = await toggleWhatsAppBotAction(enable)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(enable ? "Bot de WhatsApp activado" : "Bot de WhatsApp desactivado")
      router.refresh()
    })
  }

  return (
    <div className="sf-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/15 text-[#25D366]">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Bot de WhatsApp</h2>
            <p className="text-[11px] text-muted-foreground">
              Conecta el número del bot para que responda solo por WhatsApp.
            </p>
          </div>
        </div>
        {connection.connected && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              connection.status === "disabled"
                ? "bg-muted text-muted-foreground"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            }`}
          >
            {connection.status === "disabled" ? "Pausado" : <><Check className="h-3 w-3" /> Activo</>}
          </span>
        )}
      </div>

      {/* Estado conectado: webhook + toggle */}
      {connection.connected && !showForm && (
        <div className="space-y-3">
          <CopyRow label="URL del Webhook (pégala en Meta)" value={webhookUrl} />
          {verifyToken && (
            <CopyRow label="Verify Token (pégalo en Meta)" value={verifyToken} mono />
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onToggle}
              disabled={pending}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${
                connection.status === "disabled"
                  ? "bg-[#25D366] text-white hover:opacity-90"
                  : "border border-border bg-background text-muted-foreground hover:border-border-strong"
              }`}
            >
              <Power className="h-3.5 w-3.5" />
              {connection.status === "disabled" ? "Activar bot" : "Pausar bot"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-[12.5px] text-muted-foreground hover:border-border-strong"
            >
              Editar credenciales
            </button>
          </div>
        </div>
      )}

      {/* Formulario de credenciales */}
      {showForm && (
        <form onSubmit={onSave} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Phone Number ID <span className="text-danger">*</span>
            </label>
            <input
              name="phone_number_id"
              defaultValue={connection.phoneNumberId ?? ""}
              placeholder="123456789012345"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Access Token (permanente) <span className="text-danger">*</span>
            </label>
            <input
              name="access_token"
              type="password"
              placeholder="EAAG..."
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Business Account ID (opcional)
            </label>
            <input
              name="business_account_id"
              defaultValue={connection.businessAccountId ?? ""}
              placeholder="987654321"
              className={inputCls}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Conectar número
            </button>
            {connection.connected && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {/* Guía de setup de Meta */}
      <button
        type="button"
        onClick={() => setShowGuide((v) => !v)}
        className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:text-brand/80"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showGuide ? "rotate-180" : ""}`} />
        ¿Cómo obtengo estas credenciales en Meta?
      </button>
      {showGuide && (
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[12px] leading-relaxed text-muted-foreground">
          <li>Entrá a <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-brand underline">developers.facebook.com</a> → crear una App tipo <strong>Business</strong>.</li>
          <li>Agregá el producto <strong>WhatsApp</strong>. Te da un número de prueba o conectás tu número extra.</li>
          <li>Copiá el <strong>Phone Number ID</strong> (en WhatsApp → API Setup).</li>
          <li>Generá un <strong>token permanente</strong>: creá un usuario de sistema en Business Settings con permiso <code>whatsapp_business_messaging</code> y generá el token (sin expiración).</li>
          <li>Pegá Phone Number ID + Token acá arriba y guardá.</li>
          <li>En Meta → WhatsApp → Configuration → <strong>Webhook</strong>: pegá la URL del Webhook y el Verify Token de arriba, y suscribite al campo <strong>messages</strong>.</li>
          <li>Activá el bot y mandate un WhatsApp de prueba al número. 🎉</li>
        </ol>
      )}
    </div>
  )
}

function CopyRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
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
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`truncate text-[12px] text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="rounded-md border border-border p-1 text-muted-foreground hover:border-border-strong"
        title="Copiar"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  )
}
