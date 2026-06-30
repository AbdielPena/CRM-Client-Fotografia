"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Clock, X } from "lucide-react"
import { toast } from "sonner"

import { changeSessionTimeAction } from "@/server/actions/project.actions"
import { cn } from "@/lib/utils/cn"

/**
 * Cambia la hora de la sesión con un MOTIVO. Al guardar: actualiza Google
 * Calendar y avisa al cliente por correo + WhatsApp.
 */
export function ChangeSessionTime({
  projectId,
  currentTime,
}: {
  projectId: string
  currentTime: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState((currentTime ?? "").slice(0, 5))
  const [reason, setReason] = useState("")
  const [busy, start] = useTransition()

  const submit = () => {
    if (!/^\d{2}:\d{2}$/.test(time)) {
      toast.error("Pon una hora válida")
      return
    }
    if (!reason.trim()) {
      toast.error("Indica el motivo del cambio")
      return
    }
    start(async () => {
      const r = await changeSessionTimeAction(projectId, time, reason.trim())
      if (r.error) {
        toast.error(r.error)
        return
      }
      if (!r.ok) {
        toast.message("La hora es la misma; no se cambió nada")
        return
      }
      const extras = [
        r.emailed ? "correo enviado" : null,
        r.whatsappApi ? "WhatsApp enviado" : "WhatsApp listo para enviar",
      ]
        .filter(Boolean)
        .join(" · ")
      toast.success(`Hora actualizada — ${extras}. Google Calendar actualizado.`)
      setOpen(false)
      setReason("")
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
      >
        <Clock className="h-3 w-3" /> Cambiar hora
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-foreground">Cambiar hora de la sesión</p>
        <button
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Nueva hora</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-0.5 block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Motivo del cambio (obligatorio)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Ej: Ajuste de agenda / disponibilidad del salón…"
            className="mt-0.5 block w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <p className="text-[10.5px] text-muted-foreground">
          Se avisará al cliente por correo y WhatsApp, y se actualizará Google Calendar.
        </p>
        <button
          onClick={submit}
          disabled={busy}
          className={cn(
            "w-full rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition-opacity",
            busy && "opacity-60",
          )}
        >
          {busy ? "Guardando…" : "Guardar y avisar al cliente"}
        </button>
      </div>
    </div>
  )
}
