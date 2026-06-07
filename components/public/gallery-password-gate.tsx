"use client"

import { useState } from "react"
import { Lock, Loader2 } from "lucide-react"

export function GalleryPasswordGate({
  token,
  galleryName,
}: {
  token: string
  galleryName: string
}) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/galleries/public/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? "Contraseña incorrecta")
      }
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="client-luxe relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="bg-luxe-radial pointer-events-none absolute inset-0" />
      <form
        onSubmit={submit}
        className="lx-card animate-fade-in-up relative w-full max-w-sm p-8 text-center"
      >
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-white shadow-luxe">
          <Lock className="h-5 w-5" />
        </div>
        <p className="lx-overline mb-2">Galería privada</p>
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          {galleryName}
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Esta galería está protegida. Ingresa la contraseña que te compartió tu
          fotógrafo.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="sf-input-focus mt-6 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-center text-sm text-foreground focus:outline-none"
        />
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || !password}
          className="lx-btn-gold mt-4 w-full disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar a la galería"}
        </button>
      </form>
    </div>
  )
}
