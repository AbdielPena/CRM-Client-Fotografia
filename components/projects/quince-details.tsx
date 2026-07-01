"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Crown, X } from "lucide-react"
import { toast } from "sonner"

import { saveQuinceDetailsAction } from "@/server/actions/project.actions"
import { cn } from "@/lib/utils/cn"

/**
 * Editor inline de los datos de la quinceañera (sesiones de quinceañera):
 *  - Nombre → se usa como nombre por defecto al crear galerías de la sesión.
 *  - Cumpleaños → define la entrega pautada (2 días antes) y el badge de
 *    prioridad en Galerías.
 */
export function QuinceDetails({
  projectId,
  currentName,
  currentBirthday,
}: {
  projectId: string
  currentName: string | null
  currentBirthday: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(currentName ?? "")
  const [date, setDate] = useState((currentBirthday ?? "").slice(0, 10))
  const [busy, start] = useTransition()

  const submit = () => {
    if (!name.trim()) {
      toast.error("Escribe el nombre de la quinceañera")
      return
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Pon una fecha válida")
      return
    }
    start(async () => {
      const r = await saveQuinceDetailsAction(projectId, { name: name.trim(), birthday: date })
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar")
        return
      }
      toast.success(
        date
          ? "Datos guardados — entrega recalculada (2 días antes del cumpleaños)"
          : "Datos guardados",
      )
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    const hasAny = !!(currentName || currentBirthday)
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
      >
        <Crown className="h-3 w-3" />
        {hasAny ? "Editar datos de la quinceañera" : "Registrar datos de la quinceañera"}
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-foreground">
          Datos de la quinceañera
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
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Nombre de la quinceañera</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Elianny Martínez"
            className="mt-0.5 block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
          <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
            Se usa como nombre por defecto al crear sus galerías.
          </span>
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Cumpleaños (opcional)</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-0.5 block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
          <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
            La entrega queda pautada 2 días antes del cumpleaños (o 3 semanas
            después de la sesión, lo que ocurra primero).
          </span>
        </label>
        <button
          onClick={submit}
          disabled={busy}
          className={cn(
            "w-full rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition-opacity",
            busy && "opacity-60",
          )}
        >
          {busy ? "Guardando…" : "Guardar datos"}
        </button>
      </div>
    </div>
  )
}
