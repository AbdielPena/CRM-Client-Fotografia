"use client"

import * as React from "react"
import { X } from "lucide-react"
import { toast } from "sonner"

import { formatCurrency } from "@/lib/utils/currency"
import { registerAssignmentPaymentAction } from "@/server/actions/collaborator.actions"

/**
 * Registro de pago del trabajo de UNA sesión: completo, parcial o manual.
 *
 * Vive aparte porque se usa en los dos sitios: la pantalla de Colaboradores
 * (donde Abdiel lleva el control de lo que le debe a cada persona) y el detalle
 * de la sesión.
 */
export type PayableAssignment = {
  id: string
  agreedPay: number
  paidAmount: number
  collaboratorName: string
  sessionName?: string | null
  serviceDate?: string | null
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
const labelCls = "mb-1 block text-xs font-medium text-foreground"

function hoyRD() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export function AssignmentPaymentModal({
  row,
  currency = "DOP",
  projectId,
  financeAccounts = [],
  onClose,
  onSaved,
}: {
  row: PayableAssignment
  currency?: string
  projectId?: string
  financeAccounts?: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const saldo = Math.max(0, row.agreedPay - row.paidAmount)
  const [amount, setAmount] = React.useState<string>(String(saldo))
  const [method, setMethod] = React.useState("Transferencia")
  const [accountId, setAccountId] = React.useState("")
  const [paidOn, setPaidOn] = React.useState(hoyRD)
  const [note, setNote] = React.useState("")
  const [sendReceipt, setSendReceipt] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const monto = Number(amount) || 0
  const esParcial = monto > 0 && monto < saldo
  const restante = Math.max(0, saldo - monto)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (monto <= 0) {
      toast.error("Indica un monto mayor que cero")
      return
    }
    setSaving(true)
    const fd = new FormData()
    fd.set("amount", String(monto))
    fd.set("method", method)
    fd.set("paidOn", paidOn)
    fd.set("note", note)
    fd.set("accountId", accountId)
    if (projectId) fd.set("projectId", projectId)
    fd.set("sendReceipt", sendReceipt ? "1" : "0")
    try {
      const r = await registerAssignmentPaymentAction(row.id, fd)
      if (!r.ok) {
        toast.error(r.error)
        setSaving(false)
        return
      }
      toast.success(
        r.payStatus === "paid"
          ? `Pago completo · recibo ${r.receiptNumber}`
          : `Abono registrado · resta ${formatCurrency(r.pending, currency)}`,
        {
          description: [
            r.finanzapp ? "Registrado en Finanzas" : "Pendiente de espejar en Finanzas",
            r.emailed ? "Recibo enviado por correo" : null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      )
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Registrar pago</h3>
            <p className="text-xs text-muted-foreground">
              {row.collaboratorName}
              {row.sessionName ? ` · ${row.sessionName}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Acordado</span>
            <span className="font-medium text-foreground">
              {formatCurrency(row.agreedPay, currency)}
            </span>
          </div>
          {row.paidAmount > 0 && (
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Ya abonado</span>
              <span className="font-medium text-emerald-600">
                {formatCurrency(row.paidAmount, currency)}
              </span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border/60 pt-1">
            <span className="text-muted-foreground">Saldo</span>
            <span className="font-semibold text-amber-600">
              {formatCurrency(saldo, currency)}
            </span>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className={labelCls}>Monto a pagar</label>
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => setAmount(String(saldo))}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
              >
                Pago completo
              </button>
              <button
                type="button"
                onClick={() => setAmount(String(Math.round(saldo / 2)))}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
              >
                Mitad
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={saldo}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputCls}
              required
            />
            {esParcial && (
              <p className="mt-1 text-[11px] text-sky-600">
                Abono parcial · quedará un saldo de {formatCurrency(restante, currency)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Método</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={inputCls}
              >
                <option>Transferencia</option>
                <option>Efectivo</option>
                <option>Tarjeta</option>
                <option>Cheque</option>
                <option>Otro</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Fecha del pago</label>
              <input
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {financeAccounts.length > 0 && (
            <div>
              <label className={labelCls}>Cuenta de dónde sale el dinero</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={inputCls}
              >
                <option value="">(usar la cuenta por defecto)</option>
                {financeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Nota (opcional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: adelanto acordado por WhatsApp"
              className={inputCls}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={sendReceipt}
              onChange={(e) => setSendReceipt(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Enviar recibo por correo al colaborador
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "Registrando…" : "Registrar pago"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
