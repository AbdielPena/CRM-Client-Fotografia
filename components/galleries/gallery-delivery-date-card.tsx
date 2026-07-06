"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, Check } from "lucide-react"
import { toast } from "sonner"

import { setGalleryDeliveryDateAction } from "@/server/actions/gallery.actions"
import { cn } from "@/lib/utils/cn"

/**
 * Editor de "fecha de entrega" de una galería. Pensado sobre todo para galerías
 * SIN sesión vinculada (las que tienen proyecto usan la entrega calculada). Al
 * fijar una fecha, la galería aparece en "Próximas entregas".
 */
export function GalleryDeliveryDateCard({
  galleryId,
  initialDate,
  hasProject,
}: {
  galleryId: string
  initialDate: string | null
  hasProject: boolean
}) {
  const router = useRouter()
  const [date, setDate] = useState(initialDate ?? "")
  const [busy, start] = useTransition()

  const submit = (value: string | null) =>
    start(async () => {
      const r = await setGalleryDeliveryDateAction(galleryId, value)
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar")
        return
      }
      setDate(value ?? "")
      toast.success(value ? "Fecha de entrega guardada" : "Fecha de entrega quitada")
      router.refresh()
    })

  return (
    <div className="sf-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Fecha de entrega</h2>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
        {hasProject
          ? "Esta galería está vinculada a una sesión; su entrega ya se calcula desde el proyecto. Puedes fijar una fecha manual aquí si quieres."
          : "Esta galería no tiene sesión vinculada. Fija una fecha para que aparezca en “Próximas entregas”."}
      </p>
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
        />
        <button
          type="button"
          onClick={() => submit(date || null)}
          disabled={busy}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-brand-foreground transition-opacity",
            busy && "opacity-60",
          )}
        >
          <Check className="h-3.5 w-3.5" /> Guardar
        </button>
      </div>
      {(initialDate || date) && (
        <button
          type="button"
          onClick={() => submit(null)}
          disabled={busy}
          className="mt-2 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          Quitar fecha
        </button>
      )}
    </div>
  )
}
