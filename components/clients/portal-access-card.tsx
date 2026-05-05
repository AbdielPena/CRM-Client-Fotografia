"use client"

import { useState, useTransition } from "react"
import { Copy, KeyRound, RefreshCw, Send, Check, Loader2 } from "lucide-react"
import { toast } from "sonner"

export function PortalAccessCard({
  clientId,
  clientHasEmail,
  initialCode,
  initialSentAt,
  initialLastLogin,
}: {
  clientId: string
  clientHasEmail: boolean
  initialCode: string | null
  initialSentAt: string | null
  initialLastLogin: string | null
}) {
  const [code, setCode] = useState<string | null>(initialCode)
  const [sentAt, setSentAt] = useState<string | null>(initialSentAt)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  const portalUrl =
    typeof window !== "undefined" ? `${window.location.origin}/portal/login` : ""

  const ensure = (regenerate: boolean, send: boolean) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/portal-access`, {
          method: regenerate ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ send }),
        })
        const data = (await res.json()) as {
          code?: string
          sent?: boolean
          error?: string
        }
        if (!res.ok || data.error) {
          toast.error(data.error ?? "Error")
          return
        }
        setCode(data.code ?? null)
        if (data.sent) {
          setSentAt(new Date().toISOString())
          toast.success("Código enviado por email")
        } else {
          toast.success(regenerate ? "Código regenerado" : "Código listo")
        }
      } catch {
        toast.error("Error de conexión")
      }
    })
  }

  const copyCode = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  return (
    <div className="sf-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Acceso al portal
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Código privado del cliente para entrar a su portal.
          </p>
        </div>
        <KeyRound className="h-4 w-4 text-muted-foreground" />
      </div>

      {code ? (
        <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Código actual
          </p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 rounded bg-background px-3 py-2 font-mono text-base font-bold tracking-widest text-foreground">
              {code}
            </code>
            <button
              type="button"
              onClick={copyCode}
              className="rounded-md border border-border bg-background p-2 hover:bg-muted"
              aria-label="Copiar"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
          <p className="mt-2 truncate text-[11px] text-muted-foreground">
            URL: {portalUrl}
          </p>
          {sentAt && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Último envío:{" "}
              {new Intl.DateTimeFormat("es", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(sentAt))}
            </p>
          )}
          {initialLastLogin && (
            <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
              Cliente entró:{" "}
              {new Intl.DateTimeFormat("es", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(initialLastLogin))}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          Aún no se generó código de acceso para este cliente.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!code && (
          <button
            type="button"
            onClick={() => ensure(false, false)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            Generar código
          </button>
        )}
        <button
          type="button"
          onClick={() => ensure(false, true)}
          disabled={pending || !clientHasEmail}
          title={!clientHasEmail ? "El cliente no tiene email" : undefined}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {sentAt ? "Reenviar por email" : "Enviar por email"}
        </button>
        {code && (
          <button
            type="button"
            onClick={() => {
              if (!confirm("Regenerar invalida el código actual. ¿Continuar?")) return
              ensure(true, false)
            }}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerar
          </button>
        )}
      </div>
    </div>
  )
}
