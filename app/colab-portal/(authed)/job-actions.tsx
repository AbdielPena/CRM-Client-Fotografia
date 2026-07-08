"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, X } from "lucide-react"

export function JobActions({ assignmentId }: { assignmentId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | "confirm" | "reject">(null)

  async function respond(action: "confirm" | "reject") {
    setBusy(action)
    const res = await fetch("/api/colab-portal/responder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assignmentId, action }),
    })
    if (res.ok) {
      toast.success(action === "confirm" ? "Trabajo aceptado" : "Trabajo rechazado")
      router.refresh()
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      toast.error(j.error || "No se pudo responder")
      setBusy(null)
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => respond("confirm")}
        disabled={!!busy}
        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" /> Aceptar
      </button>
      <button
        type="button"
        onClick={() => respond("reject")}
        disabled={!!busy}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" /> Rechazar
      </button>
    </div>
  )
}
