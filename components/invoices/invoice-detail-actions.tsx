"use client"

import { useState, useTransition } from "react"
import { MoreHorizontal, Send, Trash2, Download } from "lucide-react"
import { sendInvoiceAction, deleteInvoiceAction } from "@/server/actions/invoice.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { toast } from "sonner"

interface InvoiceDetailActionsProps {
  invoice: { id: string; invoice_number: string; status: string }
}

export function InvoiceDetailActions({ invoice }: InvoiceDetailActionsProps) {
  const [open, setOpen] = useState(false)
  const [isSending, startSend] = useTransition()

  const canSend = invoice.status === "draft"

  const handleSend = () => {
    startSend(async () => {
      const result = await sendInvoiceAction(invoice.id)
      if (result?.success) {
        toast.success(`Factura ${invoice.invoice_number} marcada como enviada`)
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
          {isSending ? "Enviando..." : "Marcar enviada"}
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
              <button
                onClick={() => {
                  setOpen(false)
                  window.print()
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                Exportar / Imprimir
              </button>
              <hr className="my-1 border-gray-100" />
              <ConfirmDialog
                title="Eliminar factura"
                description={`¿Eliminar la factura ${invoice.invoice_number}? Esta acción no se puede deshacer.`}
                confirmLabel="Eliminar"
                danger
                onConfirm={() => deleteInvoiceAction(invoice.id)}
              >
                <button
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar factura
                </button>
              </ConfirmDialog>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
