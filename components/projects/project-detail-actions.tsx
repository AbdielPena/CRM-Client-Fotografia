"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Plus,
  Archive,
  RotateCcw,
  Ban,
} from "lucide-react"
import {
  deleteProjectAction,
  finalizeProjectAction,
  reopenProjectAction,
  undoProjectCancellationAction,
} from "@/server/actions/project.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { CancelProjectDialog } from "@/components/projects/cancel-project-dialog"

interface ProjectDetailActionsProps {
  project: { id: string; name: string; client_id?: string }
  /** Si la sesión ya está finalizada (archivada). */
  finalized?: boolean
  /** Si la sesión está entregada (habilita el botón Finalizar). */
  canFinalize?: boolean
  /** Si la sesión ya está cancelada. */
  cancelled?: boolean
  /** Nombre del cliente, para dejar claro en el diálogo que NO se borra. */
  clientName?: string | null
}

/**
 * Menú ⋮ del detalle de sesión.
 *
 * OJO con la estructura: los diálogos viven FUERA del bloque `{menuOpen && …}`.
 * Antes estaban dentro y no se abría ninguno: al tocar la opción el menú se
 * cerraba y desmontaba el diálogo en el mismo instante en que se abría — se
 * veía como si el botón no hiciera nada. Por eso cada diálogo tiene ahora su
 * propio estado aquí arriba y se usa en modo controlado.
 */
export function ProjectDetailActions({
  project,
  finalized = false,
  canFinalize = false,
  cancelled = false,
  clientName = null,
}: ProjectDetailActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
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

  const handleUndoCancel = () => {
    startTransition(async () => {
      const res = await undoProjectCancellationAction(project.id)
      if (!res.ok) {
        alert(res.error ?? "No se pudo deshacer la cancelación.")
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

  /** Cierra el menú y abre el diálogo que toca. */
  const abrir = (set: (v: boolean) => void) => {
    setMenuOpen(false)
    set(true)
  }

  const itemClass =
    "w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 w-56 bg-card rounded-lg border border-border shadow-lg z-20 py-1">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  router.push(`/projects/${project.id}/edit`)
                }}
                className={itemClass}
              >
                <Pencil className="h-4 w-4" />
                Editar proyecto
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  router.push(`/invoices/new?projectId=${project.id}`)
                }}
                className={itemClass}
              >
                <Plus className="h-4 w-4" />
                Crear factura
              </button>

              <hr className="my-1 border-border" />

              {/* Cancelar la sesión (o deshacerlo). Nunca borra al cliente. */}
              {cancelled ? (
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    handleUndoCancel()
                  }}
                  disabled={pending}
                  className={itemClass}
                >
                  <RotateCcw className="h-4 w-4" />
                  Deshacer cancelación
                </button>
              ) : (
                <button
                  onClick={() => abrir(setCancelOpen)}
                  disabled={pending}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                >
                  <Ban className="h-4 w-4" />
                  Cancelar sesión
                </button>
              )}

              {/* Finalizar / Reabrir */}
              {finalized ? (
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    handleReopen()
                  }}
                  disabled={pending}
                  className={itemClass}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reabrir sesión
                </button>
              ) : (
                <button
                  onClick={() => abrir(setFinalizeOpen)}
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
              )}

              <hr className="my-1 border-border" />
              <button
                onClick={() => abrir(setDeleteOpen)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar proyecto
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Diálogos: FUERA del menú, si no se desmontan al abrirse ─────── */}
      <CancelProjectDialog
        projectId={project.id}
        projectName={project.name}
        clientName={clientName}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
      />

      <ConfirmDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        title="Finalizar sesión"
        description={`Al finalizar, "${project.name}" se archiva y desaparece de todas las áreas activas (sesiones, pipeline, tareas, galerías) y queda solo en el apartado "Finalizadas" con todo su historial. Puedes reabrirla cuando quieras.`}
        confirmLabel="Finalizar sesión"
        onConfirm={handleFinalize}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminar proyecto"
        description={`¿Eliminar "${project.name}"? Esto borrará TAMBIÉN sus facturas, contratos, pagos, notas y galerías. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar todo"
        danger
        onConfirm={() => deleteProjectAction(project.id)}
      />
    </div>
  )
}
