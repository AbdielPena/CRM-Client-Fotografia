"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Pencil, Trash2, Plus } from "lucide-react"
import { deleteProjectAction } from "@/server/actions/project.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"

interface ProjectDetailActionsProps {
  project: { id: string; name: string; client_id?: string }
}

export function ProjectDetailActions({ project }: ProjectDetailActionsProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg border border-gray-200 shadow-lg z-20 py-1">
              <button
                onClick={() => {
                  setOpen(false)
                  router.push(`/projects/${project.id}/edit`)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Editar proyecto
              </button>
              <button
                onClick={() => {
                  setOpen(false)
                  router.push(`/invoices/new?projectId=${project.id}`)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Crear factura
              </button>
              <hr className="my-1 border-gray-100" />
              <ConfirmDialog
                title="Eliminar proyecto"
                description={`¿Eliminar "${project.name}"? Las facturas y contratos asociados no serán eliminados.`}
                confirmLabel="Eliminar"
                danger
                onConfirm={() => deleteProjectAction(project.id)}
              >
                <button
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
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
