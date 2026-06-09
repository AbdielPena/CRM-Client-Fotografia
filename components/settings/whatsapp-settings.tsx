"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Send, MessageCircle, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import {
  saveWhatsAppConfigAction,
  disconnectWhatsAppAction,
  sendWhatsAppTestAction,
} from "@/server/actions/whatsapp.actions"

interface Props {
  status: {
    connected: boolean
    phoneNumberId: string | null
    businessAccountId: string | null
  }
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"

export function WhatsAppSettings({ status }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [testing, startTest] = useTransition()
  const [testPhone, setTestPhone] = useState("")

  const onSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const r = await saveWhatsAppConfigAction(fd)
      if (r.ok) {
        toast.success("WhatsApp conectado")
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  const onDisconnect = () => {
    if (!confirm("¿Desconectar WhatsApp? Las automatizaciones por WhatsApp dejarán de enviarse.")) return
    start(async () => {
      const r = await disconnectWhatsAppAction()
      if (r.ok) {
        toast.success("WhatsApp desconectado")
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  const onTest = () => {
    if (!testPhone.trim()) {
      toast.error("Escribe un número de WhatsApp (con código de país)")
      return
    }
    startTest(async () => {
      const r = await sendWhatsAppTestAction(testPhone)
      if (r.ok) {
        toast.success("Prueba enviada (plantilla hello_world). Revisa ese WhatsApp.")
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Estado */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">WhatsApp Cloud API (Meta)</h2>
            {status.connected ? (
              <p className="flex items-center gap-1 text-[12.5px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Conectado · Phone ID {status.phoneNumberId}
              </p>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">No conectado todavía.</p>
            )}
          </div>
          {status.connected && (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Desconectar
            </button>
          )}
        </div>
      </div>

      {/* Prueba (solo si está conectado) */}
      {status.connected && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Enviar prueba</h3>
          <p className="mb-3 text-[12px] text-muted-foreground">
            Envía la plantilla <code className="rounded bg-muted px-1">hello_world</code> (pre-aprobada por Meta). El número debe estar en tu lista de destinatarios de prueba o ser un cliente real con WhatsApp.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="Ej. 18091234567 (con código de país, sin +)"
              className={inputCls}
            />
            <button
              type="button"
              onClick={onTest}
              disabled={testing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* Credenciales */}
      <form onSubmit={onSave} className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          {status.connected ? "Actualizar credenciales" : "Conectar"}
        </h3>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Phone Number ID <span className="text-danger">*</span>
          </label>
          <input name="phoneNumberId" required defaultValue={status.phoneNumberId ?? ""} className={inputCls} placeholder="Ej. 123456789012345" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Access Token <span className="text-danger">*</span>
          </label>
          <input name="accessToken" type="password" required className={inputCls} placeholder="EAAG... (token permanente del System User)" />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Por seguridad no mostramos el token guardado. Pégalo de nuevo para actualizar.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Business Account ID</label>
            <input name="businessAccountId" defaultValue={status.businessAccountId ?? ""} className={inputCls} placeholder="Opcional" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Idioma de plantillas</label>
            <input name="defaultLang" defaultValue="es" className={inputCls} placeholder="es" />
          </div>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          {pending ? "Guardando..." : status.connected ? "Actualizar" : "Conectar WhatsApp"}
        </button>
      </form>

      {/* Guía Meta */}
      <div className="rounded-xl border border-border bg-muted/30 p-5">
        <h3 className="mb-2 text-sm font-semibold text-foreground">¿Cómo obtener las credenciales? (gratis)</h3>
        <ol className="space-y-1.5 text-[12.5px] text-muted-foreground">
          <li>1. Entra a{" "}
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-brand hover:underline">
              developers.facebook.com/apps <ExternalLink className="h-3 w-3" />
            </a>{" "}
            y crea una app tipo <strong>Business</strong>.
          </li>
          <li>2. Agrega el producto <strong>WhatsApp</strong>. Meta te da un <strong>número de prueba</strong> y un token temporal al instante.</li>
          <li>3. Copia el <strong>Phone Number ID</strong> y el <strong>Access Token</strong> (en “API Setup”) y pégalos arriba.</li>
          <li>4. En “API Setup” agrega tu número personal como <strong>destinatario de prueba</strong> y usa el botón “Enviar prueba” de arriba.</li>
          <li>5. Para producción: genera un <strong>token permanente</strong> (System User) y crea/aprueba <strong>plantillas</strong> de mensaje para los envíos proactivos (cumpleaños, etc.).</li>
        </ol>
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠️ Meta exige <strong>plantillas aprobadas</strong> para mensajes que tú inicias (fuera de la ventana de 24h tras un mensaje del cliente). El texto libre solo funciona dentro de esa ventana.
        </p>
      </div>
    </div>
  )
}
