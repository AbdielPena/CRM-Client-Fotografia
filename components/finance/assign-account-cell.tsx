"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Wallet, AlertCircle, Loader2 } from "lucide-react"

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
 * Celda de la lista de pagos: muestra la cuenta actual o un dropdown si está
 * pendiente. Auto-guarda al cambiar la selección — sin botón "confirmar",
 * para que el usuario no tenga que dar dos clicks.
 */
export function AssignAccountCell({
  paymentId,
  currentAccountId,
  currentLabel,
  accounts,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (accounts.length === 0) {
    return (
      <span className="text-[11px] text-muted-foreground">Sin cuentas configuradas</span>
    )
  }

  const handleChange = (newAccountId: string) => {
    if (!newAccountId || newAccountId === currentAccountId) {
      setEditing(false)
      return
    }
    startTransition(async () => {
      const result = await assignAccountToPaymentAction(paymentId, newAccountId)
      if (result.success) {
        toast.success(
          "warning" in result && result.warning
            ? result.warning
            : "Cuenta asignada · ingreso registrado en FinanzApp",
        )
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
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[12px] text-foreground hover:border-border hover:bg-muted transition-colors disabled:opacity-60"
          title="Cambiar cuenta"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {currentLabel ?? "—"}
        </button>
      )
    }
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-200 transition-colors disabled:opacity-60"
        title="Asignar cuenta"
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <AlertCircle className="h-3 w-3" />
        )}
        Pendiente
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={currentAccountId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => {
          if (!isPending) setEditing(false)
        }}
        autoFocus
        disabled={isPending}
        className="rounded-md border border-brand/50 bg-card px-2 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
      >
        <option value="" disabled>
          — Elegir cuenta —
        </option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nombre}
            {a.banco ? ` · ${a.banco}` : ""}
          </option>
        ))}
      </select>
      {isPending && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}
