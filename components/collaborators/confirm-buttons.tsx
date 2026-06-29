"use client"

import * as React from "react"

export function ConfirmButtons({
  token,
  accent,
  initialStatus,
}: {
  token: string
  accent: string
  initialStatus: string
}) {
  const decided =
    initialStatus === "confirmed"
      ? "confirmed"
      : initialStatus === "rejected"
        ? "rejected"
        : null
  const [state, setState] = React.useState<
    "idle" | "sending" | "confirmed" | "rejected"
  >(decided ?? "idle")
  const [note, setNote] = React.useState("")

  const respond = async (action: "confirm" | "reject") => {
    setState("sending")
    try {
      const res = await fetch(`/api/colab/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      })
      if (!res.ok) throw new Error("fail")
      setState(action === "confirm" ? "confirmed" : "rejected")
    } catch {
      setState("idle")
      alert("No se pudo registrar tu respuesta. Intenta de nuevo.")
    }
  }

  if (state === "confirmed") {
    return (
      <div
        style={{
          marginTop: 20,
          borderRadius: 12,
          background: "#ecfdf5",
          color: "#065f46",
          padding: "16px 18px",
          textAlign: "center",
          fontWeight: 600,
        }}
      >
        ✓ ¡Confirmaste tu asistencia! Gracias.
      </div>
    )
  }
  if (state === "rejected") {
    return (
      <div
        style={{
          marginTop: 20,
          borderRadius: 12,
          background: "#fef2f2",
          color: "#991b1b",
          padding: "16px 18px",
          textAlign: "center",
          fontWeight: 600,
        }}
      >
        Indicaste que no puedes asistir. Gracias por avisar.
      </div>
    )
  }

  return (
    <div style={{ marginTop: 22 }}>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota opcional para el estudio…"
        rows={2}
        style={{
          width: "100%",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          padding: "10px 12px",
          fontSize: 14,
          resize: "vertical",
          marginBottom: 12,
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => respond("confirm")}
          disabled={state === "sending"}
          style={{
            flex: 1,
            background: accent,
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "13px 16px",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Sí, confirmo asistencia
        </button>
        <button
          onClick={() => respond("reject")}
          disabled={state === "sending"}
          style={{
            background: "#fff",
            color: "#374151",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "13px 16px",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          No puedo
        </button>
      </div>
    </div>
  )
}
