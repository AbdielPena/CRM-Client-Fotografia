"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Wallet, AlertCircle, Check } from "lucide-react"

import { assignAccountToPaymentAction } from "@/server/actions/finance.actions"

export type AccountOption = {
  id: string
  nombre: string
  banco: string | null
}

interface Props {
  paymentId: string
  /** Cuenta actual (null = pendiente). */
  currentAccountId: string | null
  currentLabel: string | null
  accounts: AccountOption[]
}

/**
 * Celda de la lista de pagos: muestra la cuenta actual y, si está pendiente
 * o el usuario quiere cambiarla, abre un selector inline.
 */
export function AssignAccountCell({
  paymentId,
  currentAccountId,
  currentLabel,
  accounts,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState(currentAccountId ?? "")
  const [isPending, startTransition] = useTransition()

  if (accounts.length === 0) {
    return (
      <span className="text-[11px] text-muted-foreground">Sin cuentas configuradas</span>
    )
  }

  const handleSave = () => {
    if (!selected) return
    startTransition(async () => {
      const result = await assignAccountToPaymentAction(paymentId, selected)
      if (result.success) {
        toast.success("Cuenta asignada")
        setEditing(false)
      } else {
        toast.error(result.error ?? "No se pudo asignar")
      }
    })
  }

  if (!editing) {
    if (currentAccountId) {
      return (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[12px] text-foreground hover:border-border hover:bg-muted transition-colors"
          title="Cambiar cuenta"
        >
          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          {currentLabel ?? "—"}
        </button>
      )
    }
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-200 transition-colors"
        title="Asignar cuenta"
      >
        <AlertCircle className="h-3 w-3" />
        Pendiente
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        autoFocus
        className="rounded-md border border-border bg-card px-2 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        <option value="">— Elegir —</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nombre}
            {a.banco ? ` · ${a.banco}` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleSave}
        disabled={!selected || isPending}
        className="inline-flex items-center justify-center rounded-md bg-brand p-1 text-white hover:bg-brand/90 disabled:opacity-50"
        title="Guardar"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false)
          setSelected(currentAccountId ?? "")
        }}
        disabled={isPending}
        className="text-[11px] text-muted-foreground hover:text-foreground"
      >
        Cancelar
      </button>
    </div>
  )
}
