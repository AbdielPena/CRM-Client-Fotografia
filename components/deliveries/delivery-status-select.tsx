"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { updateDeliveryStatusAction } from "@/server/actions/delivery.actions"

const OPTIONS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_edicion", label: "En edición" },
  { value: "lista", label: "Lista para entregar" },
  { value: "entregada", label: "Entregada" },
  { value: "retrasada", label: "Retrasada" },
]

export function DeliveryStatusSelect({
  deliveryId,
  status,
}: {
  deliveryId: string
  status: string
}) {
  const [isPending, startTransition] = useTransition()
  return (
    <select
      defaultValue={status}
      disabled={isPending}
      onChange={(e) => {
        const value = e.target.value
        startTransition(async () => {
          const r = (await updateDeliveryStatusAction(deliveryId, value)) as {
            success?: boolean
            error?: string
          }
          if (r?.error) toast.error(r.error)
          else toast.success("Estado de la entrega actualizado")
        })
      }}
      className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
