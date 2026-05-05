"use client"

import { useState, useTransition } from "react"
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="mt-6 space-y-3"
    >
      <label className="block">
        <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Email
        </span>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Código de acceso
        </span>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDEFGH"
            autoComplete="off"
            className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 font-mono text-sm uppercase tracking-widest focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="h-4 w-4" />
        )}
        Entrar al portal
      </button>

      <p className="mt-3 text-center text-[11.5px] text-zinc-500 dark:text-zinc-400">
        ¿No recibiste tu código? Pedíselo a tu fotógrafo.
      </p>
    </form>
  )
}
