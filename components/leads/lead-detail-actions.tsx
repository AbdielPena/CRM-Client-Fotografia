"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Pencil, Trash2, UserCheck } from "lucide-react"
import { deleteLeadAction, convertLeadToClientAction } from "@/server/actions/lead.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"

type LeadSummary = {
  id: string
  name: string
  status: string
  converted_to_client_id?: string | null
  [key: string]: unknown
}

interface LeadDetailActionsProps {
  lead: LeadSummary
}

export function LeadDetailActions({ lead }: LeadDetailActionsProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const hasBeenConverted = !!lead.converted_to_client_id

  return (
    <div className="relative flex items-center gap-2">
      {!hasBeenConverted && lead.status !== "lost" && lead.status !== "archived" && (
        <ConfirmDialog
          title="Convertir a cliente"
          description={`¿Convertir "${lead.name}" en un cliente activo? El lead quedará marcado como Ganado.`}
          confirmLabel="Convertir"
          onConfirm={() => convertLeadToClientAction(lead.id)}
        >
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
            <UserCheck className="h-4 w-4" />
            Convertir a cliente
          </button>
        </ConfirmDialog>
      )}

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
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg border border-gray-200 shadow-lg z-20 py-1">
              <button
                onClick={() => {
                  setOpen(false)
                  router.push(`/leads/${lead.id}/edit`)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </button>
              <hr className="my-1 border-gray-100" />
              <ConfirmDialog
                title="Eliminar lead"
                description={`¿Estás seguro de eliminar "${lead.name}"? Esta acción no se puede deshacer.`}
                confirmLabel="Eliminar"
                danger
                onConfirm={() => deleteLeadAction(lead.id)}
              >
                <button
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar lead
                </button>
              </ConfirmDialog>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
