"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Pencil, Trash2, Plus, Archive, RotateCcw } from "lucide-react"
import {
  deleteProjectAction,
  finalizeProjectAction,
  reopenProjectAction,
} from "@/server/actions/project.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"

interface ProjectDetailActionsProps {
  project: { id: string; name: string; client_id?: string }
  /** Si la sesión ya está finalizada (archivada). */
  finalized?: boolean
  /** Si la sesión está entregada (habilita el botón Finalizar). */
  canFinalize?: boolean
}

export function ProjectDetailActions({
  project,
  finalized = false,
  canFinalize = false,
}: ProjectDetailActionsProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const handleFinalize = () => {
    startTransition(async () => {
      const res = await finalizeProjectAction(project.id)
      if (!res.ok) {
        alert(res.error ?? "No se pudo finalizar la sesión.")
        return
      }
      router.refresh()
    })
  }

  const handleReopen = () => {
    startTransition(async () => {
      const res = await reopenProjectAction(project.id)
      if (!res.ok) {
        alert(res.error ?? "No se pudo reabrir la sesión.")
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-56 bg-card rounded-lg border border-border shadow-lg z-20 py-1">
              <button
                onClick={() => {
                  setOpen(false)
                  router.push(`/projects/${project.id}/edit`)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Editar proyecto
              </button>
              <button
                onClick={() => {
                  setOpen(false)
                  router.push(`/invoices/new?projectId=${project.id}`)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <Plus className="h-4 w-4" />
                Crear factura
              </button>

              <hr className="my-1 border-border" />

              {/* Finalizar / Reabrir */}
              {finalized ? (
                <button
                  onClick={() => {
                    setOpen(false)
                    handleReopen()
                  }}
                  disabled={pending}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reabrir sesión
                </button>
              ) : (
                <ConfirmDialog
                  title="Finalizar sesión"
                  description={`Al finalizar, "${project.name}" se archiva y desaparece de todas las áreas activas (sesiones, pipeline, tareas, galerías) y queda solo en el apartado "Finalizadas" con todo su historial. Puedes reabrirla cuando quieras.`}
                  confirmLabel="Finalizar sesión"
                  onConfirm={handleFinalize}
                >
                  <button
                    onClick={() => setOpen(false)}
                    disabled={!canFinalize || pending}
                    title={
                      canFinalize
                        ? undefined
                        : "Solo puedes finalizar una sesión que ya esté entregada."
                    }
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Archive className="h-4 w-4" />
                    Finalizar sesión
                  </button>
                </ConfirmDialog>
              )}

              <hr className="my-1 border-border" />
              <ConfirmDialog
                title="Eliminar proyecto"
                description={`¿Eliminar "${project.name}"? Esto borrará TAMBIÉN sus facturas, contratos, pagos, notas y galerías. Esta acción no se puede deshacer.`}
                confirmLabel="Eliminar todo"
                danger
                onConfirm={() => deleteProjectAction(project.id)}
              >
                <button
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar proyecto
                </button>
              </ConfirmDialog>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
