"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function ActivarForm({
  token,
  name,
  email,
}: {
  token: string
  name: string
  email: string | null
}) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pin, setPin] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (password.length < 6) return setErr("La contraseña debe tener al menos 6 caracteres")
    if (password !== confirm) return setErr("Las contraseñas no coinciden")
    if (pin && (pin.length < 4 || pin.length > 8)) return setErr("El PIN debe tener de 4 a 8 dígitos")
    setBusy(true)
    const res = await fetch("/api/colab-portal/activar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password, pin: pin || undefined }),
    })
    if (res.ok) {
      setDone(true)
      setTimeout(() => router.push("/colab-portal/login"), 1400)
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      setErr(j.error || "No se pudo activar")
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-center shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <p className="text-[14px] font-semibold text-emerald-800 dark:text-emerald-200">
          ¡Listo, {name.split(" ")[0]}!
        </p>
        <p className="mt-1 text-[12.5px] text-emerald-700 dark:text-emerald-300">
          Tu portal quedó activo. Te llevamos al inicio de sesión…
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="mb-4 text-[13px] text-muted-foreground">
        Hola <span className="font-semibold text-foreground">{name}</span>
        {email ? (
          <>
            {" "}· tu correo de acceso es <span className="font-medium text-foreground">{email}</span>
          </>
        ) : null}
      </p>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-foreground">Contraseña</label>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inp}
            placeholder="Al menos 6 caracteres"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-foreground">Repite la contraseña</label>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inp}
            placeholder="••••••••"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-foreground">
            PIN (opcional) <span className="font-normal text-muted-foreground">— para entrar más rápido</span>
          </label>
          <input
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className={`${inp} tracking-[0.3em]`}
            placeholder="4 a 8 dígitos"
            maxLength={8}
          />
        </div>

        {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{err}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          {busy ? "Activando…" : "Activar mi portal"}
        </button>
      </form>
    </div>
  )
}

const inp =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
