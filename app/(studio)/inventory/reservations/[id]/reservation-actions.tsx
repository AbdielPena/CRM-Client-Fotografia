"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"

import {
  cancelInvReservationAction,
  confirmInvReservationAction,
} from "@/server/actions/inv-reservation.actions"
import { Button } from "@/components/ui/button"

export function ReservationActions({
  reservationId,
  isOverdue,
  currentStatus,
}: {
  reservationId: string
  isOverdue: boolean
  currentStatus: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err"
    msg: string
  } | null>(null)

  async function handleConfirm() {
    startTransition(async () => {
      const res = await confirmInvReservationAction(reservationId)
      setFeedback({
        type: res.ok ? "ok" : "err",
        msg: res.message ?? "",
      })
      if (res.ok) router.refresh()
    })
  }

  async function handleCancel() {
    const reason =
      window.prompt("Razón de cancelación (opcional):") ?? undefined
    if (reason === null) return
    startTransition(async () => {
      const res = await cancelInvReservationAction(reservationId, reason)
      setFeedback({
        type: res.ok ? "ok" : "err",
        msg: res.message ?? "",
      })
      if (res.ok) router.refresh()
    })
  }

  return (
    <section className="sf-card p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Acciones
      </h3>

      {feedback && (
        <div
          className={
            "mb-3 rounded-lg px-3 py-2 text-xs " +
            (feedback.type === "ok"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300")
          }
        >
          {feedback.msg}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {currentStatus === "pendiente" && !isOverdue && (
          <Button onClick={handleConfirm} disabled={isPending} size="sm">
            {isPending ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1 size-3.5" />
            )}
            Confirmar reserva
          </Button>
        )}
        <Button
          onClick={handleCancel}
          disabled={isPending}
          size="sm"
          variant="outline"
          className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
        >
          <XCircle className="mr-1 size-3.5" />
          Cancelar reserva
        </Button>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Para convertir esta reserva en préstamo o renta, ve a /inventory/loans/new
        o /inventory/rentals/new y especifica este código de reserva (próxima
        iteración).
      </p>
    </section>
  )
}
