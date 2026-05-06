"use client"

import { Trash2 } from "lucide-react"
import { deleteClientAction } from "@/server/actions/client.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"

interface DeleteClientButtonProps {
  clientId: string
  clientName: string
}

export function DeleteClientButton({ clientId, clientName }: DeleteClientButtonProps) {
  return (
    <ConfirmDialog
      title="Eliminar cliente"
      description={`¿Eliminar a "${clientName}"? Esta acción no se puede deshacer. Sus proyectos, contratos y facturas no se eliminarán.`}
      confirmLabel="Sí, eliminar"
      danger
      onConfirm={async () => {
        await deleteClientAction(clientId)
      }}
    >
      <button
        type="button"
        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        Eliminar cliente
      </button>
    </ConfirmDialog>
  )
}
