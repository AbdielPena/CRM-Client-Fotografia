"use client"

import { useState } from "react"

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
        throw new Error(j.error ?? "password incorrecto")
      }
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl border border-zinc-200 p-8 max-w-sm w-full shadow-sm"
      >
        <h1 className="text-xl font-semibold text-zinc-900">{galleryName}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Esta galería está protegida con contraseña.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="mt-6 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        {error ? <p className="text-xs text-red-600 mt-2">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-4 w-full bg-zinc-900 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </div>
  )
}
