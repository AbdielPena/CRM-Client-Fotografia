"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import {
  cancelProjectAction,
  previewProjectCancellationAction,
} from "@/server/actions/project.actions"

/**
 * Diálogo de "Cancelar sesión".
 *
 * Muestra por adelantado TODO lo que va a pasar, porque cancelar mueve dinero,
 * libera la fecha y le escribe al cliente. Lo más importante que comunica: el
 * cliente NO se borra — se queda para seguir recibiendo los correos de
 * fidelidad. Sin eso, la reacción natural sería borrar el cliente y perderlo.
 */
export function CancelProjectDialog({
  projectId,
  projectName,
  clientName,
  onDone,
  children,
}: {
  projectId: string
  projectName: string
  clientName?: string | null
  onDone?: () => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [deposit, setDeposit] = useState<"kept" | "refunded">("kept")
  const [notifyClient, setNotifyClient] = useState(true)
  const [paid, setPaid] = useState<{ amount: number; currency: string } | null>(
    null,
  )
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  // Al abrir se consulta cuánto se cobró: si no hay dinero, no se pregunta nada
  // sobre el abono.
  useEffect(() => {
    if (!open) return
    let vivo = true
    setLoadingPreview(true)
    previewProjectCancellationAction(projectId)
      .then((r) => {
        if (!vivo) return
        setPaid({ amount: r.paidAmount ?? 0, currency: r.currency ?? "DOP" })
      })
      .finally(() => vivo && setLoadingPreview(false))
    return () => {
      vivo = false
    }
  }, [open, projectId])

  const money = (n: number, currency: string) =>
    new Intl.NumberFormat("es-DO", { style: "currency", currency }).format(n)

  const hayDinero = (paid?.amount ?? 0) > 0

  const confirmar = () => {
    startTransition(async () => {
      const res = await cancelProjectAction(projectId, {
        reason: reason.trim() || null,
        deposit: hayDinero ? deposit : "none",
        notifyClient,
      })
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo cancelar la sesión.")
        return
      }
      const partes: string[] = ["Sesión cancelada"]
      if (res.cancelledInvoices) {
        partes.push(
          `${res.cancelledInvoices} factura${res.cancelledInvoices === 1 ? "" : "s"} anulada${res.cancelledInvoices === 1 ? "" : "s"}`,
        )
      }
      if (res.refundRecorded) partes.push("devolución registrada en Finanzas")
      if (res.clientNotified) partes.push("cliente avisado por correo")
      toast.success(partes.join(" · "))
      setOpen(false)
      onDone?.()
      router.refresh()
    })
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-lg bg-danger/10 p-2">
                  <AlertTriangle className="h-4 w-4 text-danger" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Cancelar sesión
                  </h2>
                  <p className="text-[13px] text-muted-foreground">
                    {projectName}
                    {clientName ? ` · ${clientName}` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
              {/* Lo que va a pasar */}
              <div className="rounded-xl bg-muted/50 p-3.5">
                <p className="mb-2 text-[12.5px] font-semibold text-foreground">
                  Qué va a pasar
                </p>
                <ul className="space-y-1 text-[12.5px] text-muted-foreground">
                  <li>· Se anula lo que quedaba por cobrar.</li>
                  <li>· La fecha se libera (sale del calendario y de la agenda).</li>
                  <li>· Se apaga el reloj de entrega y sus tareas pendientes.</li>
                  <li>· La sesión sale de todas las listas y queda en Canceladas.</li>
                </ul>
              </div>

              {/* La garantía que importa */}
              <div className="rounded-xl border border-emerald-600/25 bg-emerald-600/[0.07] p-3.5">
                <p className="text-[12.5px] text-foreground">
                  <strong>{clientName ?? "El cliente"} no se borra.</strong> Su
                  ficha queda activa y le van a seguir llegando tus correos de
                  fidelidad — cumpleaños, campañas y recordatorios. Solo si lo
                  mandas a la papelera dejaría de recibirlos.
                </p>
              </div>

              {/* Qué pasa con el dinero ya cobrado */}
              {loadingPreview ? (
                <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Revisando pagos…
                </p>
              ) : hayDinero && paid ? (
                <div>
                  <p className="mb-2 text-[13px] font-medium text-foreground">
                    Ya cobraste{" "}
                    <strong>{money(paid.amount, paid.currency)}</strong>. ¿Qué
                    hacemos con ese dinero?
                  </p>
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                      <input
                        type="radio"
                        name="deposit"
                        className="mt-0.5"
                        checked={deposit === "kept"}
                        onChange={() => setDeposit("kept")}
                      />
                      <span className="text-[12.5px]">
                        <strong className="text-foreground">Me lo quedo</strong>
                        <span className="block text-muted-foreground">
                          Reserva no reembolsable: el dinero queda como ingreso
                          ganado.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                      <input
                        type="radio"
                        name="deposit"
                        className="mt-0.5"
                        checked={deposit === "refunded"}
                        onChange={() => setDeposit("refunded")}
                      />
                      <span className="text-[12.5px]">
                        <strong className="text-foreground">Se lo devuelvo</strong>
                        <span className="block text-muted-foreground">
                          Queda anotado en Finanzas como algo que le debes, hasta
                          que se lo entregues.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              ) : (
                <p className="text-[12.5px] text-muted-foreground">
                  No hay pagos registrados en esta sesión, así que no hay dinero
                  que mover.
                </p>
              )}

              {/* Motivo */}
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-foreground">
                  Motivo <span className="text-muted-foreground">(opcional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Ej: la familia cambió la fecha del evento"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  Queda en el historial. Si avisas al cliente, también va en el
                  correo.
                </p>
              </div>

              {/* Aviso al cliente */}
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={notifyClient}
                  onChange={(e) => setNotifyClient(e.target.checked)}
                />
                <span className="text-[12.5px] text-foreground">
                  Avisarle al cliente por correo
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                Volver
              </button>
              <button
                onClick={confirmar}
                disabled={pending || loadingPreview}
                className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Cancelar la sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
