"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Link2, Check } from "lucide-react"
import { toast } from "sonner"

import { linkGalleryToSessionAction } from "@/server/actions/gallery.actions"
import { cn } from "@/lib/utils/cn"

/**
 * Vincular una galería HUÉRFANA (sin cliente/sesión) a una sesión existente.
 * Solo se muestra cuando la galería no tiene cliente. Al vincular, la sesión
 * pasa a "Esperando selección" (automatización) y la galería queda en su perfil.
 */
export function GalleryLinkSessionCard({
  galleryId,
  sessions,
}: {
  galleryId: string
  sessions: { projectId: string; label: string }[]
}) {
  const router = useRouter()
  const [projectId, setProjectId] = useState("")
  const [busy, start] = useTransition()

  const submit = () => {
    if (!projectId) {
      toast.error("Elige una sesión")
      return
    }
    start(async () => {
      const r = await linkGalleryToSessionAction(galleryId, projectId)
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo vincular")
        return
      }
      toast.success("Galería vinculada a la sesión")
      router.refresh()
    })
  }

  return (
    <div className="sf-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Vincular a una sesión</h2>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
        Esta galería no está vinculada a ninguna sesión. Vincúlala a la sesión de su
        cliente: la sesión pasará a <strong>“Esperando selección”</strong> y la galería
        quedará en el perfil del cliente.
      </p>
      {sessions.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          No hay sesiones disponibles para vincular.
        </p>
      ) : (
        <div className="flex gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
          >
            <option value="">Elige una sesión…</option>
            {sessions.map((s) => (
              <option key={s.projectId} value={s.projectId}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-brand-foreground transition-opacity",
              busy && "opacity-60",
            )}
          >
            <Check className="h-3.5 w-3.5" /> Vincular
          </button>
        </div>
      )}
    </div>
  )
}
