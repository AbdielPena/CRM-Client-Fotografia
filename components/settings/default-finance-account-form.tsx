"use client"

import { useState, useTransition } from "react"
import { Wallet } from "lucide-react"
import { toast } from "sonner"
import { updateDefaultFinanceAccountAction } from "@/server/actions/settings.actions"

export type FinanceAccountOption = {
  id: string
  nombre: string
  bancoNombre?: string | null
  currency: string
}

interface Props {
  accounts: FinanceAccountOption[]
  currentAccountId: string | null
}

export function DefaultFinanceAccountForm({ accounts, currentAccountId }: Props) {
  const [selected, setSelected] = useState<string>(currentAccountId ?? "")
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    const next = selected.trim() ? selected : null
    startTransition(async () => {
      const result = await updateDefaultFinanceAccountAction(next)
      if (result.success) {
        toast.success("Cuenta default actualizada")
      } else {
        toast.error(result.error ?? "No se pudo actualizar")
      }
    })
  }

  const dirty = (currentAccountId ?? "") !== selected

  if (accounts.length === 0) {
    return (
      <div className="sf-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            Cuenta default de Finanzas
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          No se encontraron cuentas en tu app de Finanzas. Créalas en{" "}
          <a
            href="https://fi.abbypixel.com"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            fi.abbypixel.com
          </a>{" "}
          y vuelve aquí para elegir cuál recibe los pagos por defecto.
        </p>
      </div>
    )
  }

  return (
    <div className="sf-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          Cuenta default de Finanzas
        </h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Cuando registras un pago a una factura, el ingreso se registra en tu app
        de Finanzas (fi.abbypixel.com) contra esta cuenta. Puedes cambiarla por
        pago en cada caso.
      </p>

      <div className="space-y-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-card"
        >
          <option value="">— Ninguna (sin cuenta default) —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
              {a.bancoNombre ? ` · ${a.bancoNombre}` : ""}
              {` (${a.currency})`}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || isPending}
          className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {isPending ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  )
}
