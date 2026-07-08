"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { History } from "lucide-react"

import { setRequirementsWaivedAction } from "@/server/actions/project.actions"

/**
 * Marca una sesión como "antigua": oculta las marcas de pendiente de
 * hora / colaborador / vestido (para sesiones que pasaron antes de agregar
 * esas funciones). Reversible.
 */
export function RequirementsWaiveToggle({
  projectId,
  waived,
}: {
  projectId: string
  waived: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  const toggle = () => {
    startTransition(async () => {
      const res = await setRequirementsWaivedAction(projectId, !waived)
      if (res.ok) {
        toast.success(
          !waived ? "Marcada como sesión antigua" : "Requisitos reactivados",
        )
        router.refresh()
      } else {
        toast.error(res.error ?? "No se pudo actualizar")
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
      title={
        waived
          ? "Volver a pedir hora, colaborador y vestido en esta sesión"
          : "Esta sesión ya pasó: no pedir hora, colaborador ni vestido"
      }
    >
      <History className="h-3.5 w-3.5" />
      {waived ? "Reactivar requisitos" : "Sesión antigua · ocultar pendientes"}
    </button>
  )
}
