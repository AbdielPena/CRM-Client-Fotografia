"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { deleteClientAction } from "@/server/actions/client.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"

type ClientSummary = {
  id: string
  name: string
  [key: string]: unknown
}

interface ClientDetailActionsProps {
  client: ClientSummary
}

export function ClientDetailActions({ client }: ClientDetailActionsProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
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
          <div className="absolute right-0 top-full mt-1 w-48 bg-card rounded-lg border border-border shadow-lg z-20 py-1">
            <button
              onClick={() => {
                setOpen(false)
                router.push(`/clients/${client.id}/edit`)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Editar cliente
            </button>
            <hr className="my-1 border-border" />
            <ConfirmDialog
              title="Mover a la Papelera"
              description={`¿Mover a "${client.name}" a la Papelera? Sus proyectos, contratos, facturas y galerías también se ocultarán. Podés restaurarlo en cualquier momento desde /trash.`}
              confirmLabel="Mover a Papelera"
              danger
              onConfirm={async () => {
                await deleteClientAction(client.id)
                router.push("/clients")
              }}
            >
              <button
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar cliente
              </button>
            </ConfirmDialog>
          </div>
        </>
      )}
    </div>
  )
}
