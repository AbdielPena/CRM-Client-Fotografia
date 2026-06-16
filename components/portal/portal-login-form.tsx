"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, KeyRound, Mail } from "lucide-react"
import { toast } from "sonner"

export function PortalLoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get("next") || "/portal"
  const [email, setEmail] = useState(params.get("email") ?? "")
  const [code, setCode] = useState(params.get("code") ?? "")
  const [pending, startTransition] = useTransition()

  const submit = () => {
    if (!email.includes("@")) {
      toast.error("Email inválido")
      return
    }
    if (code.trim().length < 4) {
      toast.error("Código inválido")
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/portal/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), code: code.trim() }),
        })
        const data = (await res.json()) as { ok?: boolean; error?: string; clientName?: string }
        if (!res.ok || data.error) {
          toast.error(data.error ?? "No se pudo entrar")
          return
        }
        toast.success(`Hola ${data.clientName ?? ""}`)
        router.push(next)
        router.refresh()
      } catch {
        toast.error("Error de conexión")
      }
    })
  }

  // Magic link: si la URL trae email + código, entra directo (sin pedir clic).
  const autoTried = useRef(false)
  useEffect(() => {
    const qEmail = params.get("email")
    const qCode = params.get("code")
    if (
      !autoTried.current &&
      qEmail &&
      qEmail.includes("@") &&
      qCode &&
      qCode.trim().length >= 4
    ) {
      autoTried.current = true
      submit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="mt-6 space-y-3"
    >
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Email
        </span>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="sf-input-focus w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-foreground focus:outline-none"
          />
        </div>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Código de acceso
        </span>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDEFGH"
            autoComplete="off"
            className="sf-input-focus w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 font-mono text-sm uppercase tracking-widest text-foreground focus:outline-none"
          />
        </div>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="lx-btn-gold mt-2 w-full disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="h-4 w-4" />
        )}
        Entrar al portal
      </button>

      <p className="mt-3 text-center text-[11.5px] text-muted-foreground">
        ¿No recibiste tu código? Pídeselo a tu fotógrafo.
      </p>
    </form>
  )
}
