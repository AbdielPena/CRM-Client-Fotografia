"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Wallet } from "lucide-react"

import { setDefaultAccountFromFinanceAction } from "@/server/actions/finance.actions"

type Account = { id: string; nombre: string; banco: string | null }

interface Props {
  accounts: Account[]
  currentAccountId: string | null
}

export function DefaultAccountBlock({ accounts, currentAccountId }: Props) {
  const [selected, setSelected] = useState(currentAccountId ?? "")
  const [isPending, startTransition] = useTransition()
  const dirty = (currentAccountId ?? "") !== selected

  const handleSave = () => {
    startTransition(async () => {
      const next = selected.trim() ? selected : null
      const result = await setDefaultAccountFromFinanceAction(next)
      if (result.success) toast.success("Cuenta default actualizada")
      else toast.error(result.error ?? "No se pudo actualizar")
    })
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Cuenta default</h3>
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
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Cuenta default</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Se preselecciona en el modal de pago. Puedes cambiarla por cada pago.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
        >
          <option value="">— Ninguna —</option>
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
          disabled={!dirty || isPending}
          className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {isPending ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  )
}
