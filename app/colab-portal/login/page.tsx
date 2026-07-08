"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function ColabLoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<"pass" | "pin">("pass")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pin, setPin] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const body =
      mode === "pass"
        ? { email, password }
        : email
          ? { email, pin }
          : { pin }
    const res = await fetch("/api/colab-portal/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      router.push("/colab-portal")
      router.refresh()
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      setErr(j.error || "No se pudo entrar")
      setBusy(false)
    }
  }

  const tab = (v: "pass" | "pin", label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(v)
        setErr(null)
      }}
      className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
        mode === v ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Portal del colaborador</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Consulta tus trabajos y pagos.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex gap-1 rounded-xl bg-muted/50 p-1">
            {tab("pass", "Correo y contraseña")}
            {tab("pin", "PIN")}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "pass" ? (
              <>
                <Field label="Correo">
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inp}
                    placeholder="tucorreo@ejemplo.com"
                  />
                </Field>
                <Field label="Contraseña">
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inp}
                    placeholder="••••••••"
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Correo (opcional)">
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inp}
                    placeholder="Déjalo vacío si tu PIN es único"
                  />
                </Field>
                <Field label="PIN">
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    className={`${inp} tracking-[0.3em]`}
                    placeholder="••••"
                    maxLength={8}
                  />
                </Field>
              </>
            )}

            {err && (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{err}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
            >
              {busy ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[11.5px] text-muted-foreground">
          ¿No tienes acceso? Pídele a tu estudio que te active el portal.
        </p>
      </div>
    </div>
  )
}

const inp =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}
