"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Cake, X } from "lucide-react"
import { toast } from "sonner"

import { saveQuinceBirthdayAction } from "@/server/actions/project.actions"
import { cn } from "@/lib/utils/cn"

/**
 * Editor inline del cumpleaños de la quinceañera (sesiones de quinceañera).
 * Al guardar se recalcula la entrega pautada (2 días antes del cumpleaños /
 * 3 semanas después de la sesión) y el badge de prioridad en Galerías.
 */
export function QuinceBirthday({
  projectId,
  currentBirthday,
}: {
  projectId: string
  currentBirthday: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState((currentBirthday ?? "").slice(0, 10))
  const [busy, start] = useTransition()

  const submit = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Pon una fecha válida")
      return
    }
    start(async () => {
      const r = await saveQuinceBirthdayAction(projectId, date)
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar")
        return
      }
      toast.success("Cumpleaños guardado — entrega recalculada (2 días antes)")
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
      >
        <Cake className="h-3 w-3" />
        {currentBirthday ? "Cambiar cumpleaños" : "Poner cumpleaños"}
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-foreground">
          Cumpleaños de la quinceañera
        </p>
        <button
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
        />
        <p className="text-[10.5px] text-muted-foreground">
          La entrega queda pautada 2 días antes del cumpleaños (o 3 semanas
          después de la sesión, lo que ocurra primero).
        </p>
        <button
          onClick={submit}
          disabled={busy}
          className={cn(
            "w-full rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition-opacity",
            busy && "opacity-60",
          )}
        >
          {busy ? "Guardando…" : "Guardar cumpleaños"}
        </button>
      </div>
    </div>
  )
}
