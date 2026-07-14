"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import { createDeliveryGalleryForProjectAction } from "@/server/actions/gallery-set.actions"

/**
 * Crea una Galería de ENTREGA FINAL como módulo separado para el proyecto (su
 * propia galería y enlace, sin exigir una selección previa) y redirige a ella.
 */
export function CreateDeliveryButton({
  projectId,
  variant = "link",
}: {
  projectId: string
  variant?: "link" | "empty"
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const create = () =>
    start(async () => {
      try {
        const r = await createDeliveryGalleryForProjectAction(projectId)
        toast.success(r.reused ? "Abriendo la entrega…" : "Galería de entrega creada")
        router.push(`/galleries/${r.galleryId}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error")
      }
    })

  if (variant === "empty") {
    return (
      <button
        type="button"
        onClick={create}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Crear entrega
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={create}
      disabled={pending}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "+ "}
      Crear entrega
    </button>
  )
}
