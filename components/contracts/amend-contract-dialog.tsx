"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileSignature, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { amendContractAction } from "@/server/actions/contract.actions"

/**
 * Diálogo de "Modificar contrato".
 *
 * Controlado desde el padre A PROPÓSITO: el botón que lo abre vive dentro de un
 * menú desplegable que se cierra al tocarlo. Si el diálogo viviera ahí dentro,
 * se desmontaría en el mismo instante en que se abre.
 *
 * Deja claras las dos consecuencias antes de confirmar, porque las dos son
 * visibles para el cliente: su firma anterior deja de valer, y le llega un
 * correo con el detalle del cambio.
 */
export function AmendContractDialog({
  contractId,
  contractTitle,
  clientName,
  currentTotal,
  currency = "DOP",
  wasSigned,
  open,
  onClose,
}: {
  contractId: string
  contractTitle: string
  clientName?: string | null
  currentTotal?: number | null
  currency?: string
  wasSigned: boolean
  open: boolean
  onClose: () => void
}) {
  const [summary, setSummary] = useState("")
  const [cambiarMonto, setCambiarMonto] = useState(false)
  const [monto, setMonto] = useState(
    currentTotal != null ? String(currentTotal) : "",
  )
  const [notify, setNotify] = useState(true)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const money = (n: number) =>
    new Intl.NumberFormat("es-DO", { style: "currency", currency }).format(n)

  const montoNum = Number(monto)
  const montoValido =
    !cambiarMonto || (monto.trim() !== "" && Number.isFinite(montoNum) && montoNum >= 0)

  const confirmar = () => {
    startTransition(async () => {
      const res = await amendContractAction(contractId, {
        summary: summary.trim(),
        newTotal: cambiarMonto ? montoNum : null,
        notifyClient: notify,
      })
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo modificar el contrato.")
        return
      }
      const partes = [`Contrato modificado (v${res.version})`]
      if (res.changes.length) partes.push(`${res.changes.length} cambio(s)`)
      partes.push(
        res.clientNotified ? "cliente avisado por correo" : "sin aviso al cliente",
      )
      toast.success(partes.join(" · "))
      onClose()
      router.refresh()
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-brand/10 p-2">
              <FileSignature className="h-4 w-4 text-brand" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Modificar contrato
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {contractTitle}
                {clientName ? ` · ${clientName}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[62vh] space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl bg-muted/50 p-3.5">
            <p className="mb-2 text-[12.5px] font-semibold text-foreground">
              Qué va a pasar
            </p>
            <ul className="space-y-1 text-[12.5px] text-muted-foreground">
              {wasSigned && (
                <li>
                  · La firma actual <strong>deja de valer</strong> — se guarda en
                  el historial como prueba.
                </li>
              )}
              <li>· El contrato queda pendiente de firma otra vez.</li>
              <li>· El enlace de firma sigue siendo el mismo.</li>
              <li>· Al cliente le llega el detalle de lo que cambió.</li>
            </ul>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground">
              ¿Qué cambió? <span className="text-danger">*</span>
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ej: Ajustamos el monto al precio que habíamos acordado antes del cambio de tarifas."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40"
            />
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Esto es lo que el cliente va a leer en el correo. Sé concreto.
            </p>
          </div>

          <div className="rounded-xl border border-border p-3.5">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={cambiarMonto}
                onChange={(e) => setCambiarMonto(e.target.checked)}
              />
              <span className="text-[12.5px]">
                <strong className="text-foreground">Cambiar el monto</strong>
                <span className="block text-muted-foreground">
                  Ajusta la factura, la reserva y la sesión de una vez.
                  {currentTotal != null && (
                    <> Ahora dice <strong>{money(currentTotal)}</strong>.</>
                  )}
                </span>
              </span>
            </label>
            {cambiarMonto && (
              <div className="mt-3 flex items-center gap-2 pl-7">
                <span className="text-sm text-muted-foreground">{currency}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="w-44 rounded-lg border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-brand/40"
                />
              </div>
            )}
            {cambiarMonto && (
              <p className="mt-2 pl-7 text-[11.5px] text-muted-foreground">
                Lo que ya esté cobrado no se toca; el ajuste cae sobre lo
                pendiente.
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
            />
            <span className="text-[12.5px]">
              <strong className="text-foreground">
                Avisarle al cliente por correo
              </strong>
              <span className="block text-muted-foreground">
                Con el antes y el después de cada cambio, y el botón para firmar.
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={pending || summary.trim().length < 5 || !montoValido}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {pending ? "Guardando…" : "Modificar y pedir firma"}
          </button>
        </div>
      </div>
    </div>
  )
}
