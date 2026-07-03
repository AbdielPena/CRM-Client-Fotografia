"use client"

import { useState } from "react"

const SERIF = "var(--font-serif), 'Playfair Display', 'Palatino Linotype', Georgia, serif"

export function DedicationForm({
  token,
  initialMessage,
  initialFrom,
  galleryHref,
}: {
  token: string
  initialMessage: string
  initialFrom: string
  galleryHref: string
}) {
  const [message, setMessage] = useState(initialMessage)
  const [from, setFrom] = useState(initialFrom)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) {
      setError("Escribe tu mensaje primero.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/galleries/public/${token}/dedication`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, from }),
      })
      if (!res.ok) throw new Error()
      setSaved(true)
    } catch {
      setError("No se pudo guardar. Intenta de nuevo.")
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div
        className="mt-8 rounded-2xl p-7 text-center"
        style={{ background: "#fff", border: "1px solid #E6E0D3" }}
      >
        <p style={{ fontFamily: SERIF, fontSize: "1.4rem", color: "#1D1A16" }}>
          ¡Gracias! 💛
        </p>
        <p className="mt-2 text-sm" style={{ color: "#8C8478" }}>
          Tu mensaje quedó guardado y aparecerá en la galería de tu hija.
        </p>
        <div className="mt-5 flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSaved(false)}
            className="text-sm underline"
            style={{ color: "#A9884E" }}
          >
            Editar de nuevo
          </button>
          <a href={galleryHref} className="text-sm font-medium" style={{ color: "#A9884E" }}>
            Ver la galería →
          </a>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium" style={{ color: "#3a332b" }}>
          Tu mensaje
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="Hija mía, hoy celebramos lo hermosa que eres por dentro y por fuera…"
          style={{
            width: "100%",
            borderRadius: 14,
            border: "1px solid #E6E0D3",
            background: "#fff",
            color: "#1D1A16",
            padding: "14px 16px",
            fontSize: 15,
            lineHeight: 1.6,
            fontFamily: SERIF,
            resize: "vertical",
          }}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium" style={{ color: "#3a332b" }}>
          Firma (opcional)
        </label>
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          maxLength={120}
          placeholder="Con amor, Mamá"
          style={{
            width: "100%",
            borderRadius: 12,
            border: "1px solid #E6E0D3",
            background: "#fff",
            color: "#1D1A16",
            padding: "11px 14px",
            fontSize: 14,
          }}
        />
      </div>
      {error && (
        <p className="text-sm" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        style={{
          width: "100%",
          borderRadius: 999,
          background: "#1D1A16",
          color: "#F7F3EC",
          padding: "13px",
          fontSize: 14,
          fontWeight: 600,
          opacity: saving ? 0.6 : 1,
          cursor: saving ? "default" : "pointer",
        }}
      >
        {saving ? "Guardando…" : "Guardar dedicatoria"}
      </button>
    </form>
  )
}
