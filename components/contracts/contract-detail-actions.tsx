"use client"

import { useState, useTransition } from "react"
import { MoreHorizontal, Send, XCircle, Trash2 } from "lucide-react"
import { sendContractAction, voidContractAction, deleteContractAction } from "@/server/actions/contract.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { toast } from "sonner"

interface ContractDetailActionsProps {
  contract: { id: string; title: string; status: string }
}

export function ContractDetailActions({ contract }: ContractDetailActionsProps) {
  const [open, setOpen] = useState(false)
  const [isSending, startSend] = useTransition()

  const canSend = contract.status === "draft"
  const canVoid = ["draft", "sent"].includes(contract.status)

  const handleSend = () => {
    startSend(async () => {
      const result = await sendContractAction(contract.id)
      if (result?.success) {
        toast.success("Contrato enviado — enlace de firma generado")
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {canSend && (
        <button
          onClick={handleSend}
          disabled={isSending}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {isSending ? "Enviando..." : "Enviar para firma"}
        </button>
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
              {canVoid && (
                <ConfirmDialog
                  title="Anular contrato"
                  description="¿Anular este contrato? El cliente no podrá firmarlo."
                  confirmLabel="Anular"
                  onConfirm={async () => {
                    await voidContractAction(contract.id)
                  }}
                >
                  <button
                    onClick={() => setOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <XCircle className="h-4 w-4" />
                    Anular contrato
                  </button>
                </ConfirmDialog>
              )}
              <hr className="my-1 border-gray-100" />
              <ConfirmDialog
                title="Eliminar contrato"
                description={`¿Eliminar "${contract.title}"?`}
                confirmLabel="Eliminar"
                danger
                onConfirm={() => deleteContractAction(contract.id)}
              >
                <button
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </button>
              </ConfirmDialog>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
