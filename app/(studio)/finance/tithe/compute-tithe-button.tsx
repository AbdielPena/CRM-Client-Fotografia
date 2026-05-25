"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { Calculator, Loader2 } from "lucide-react"

import {
  computeTitheAction,
  type FinTitheActionState,
} from "@/server/actions/fin-tithe.actions"
import { Button } from "@/components/ui/button"

const initialState: FinTitheActionState = {}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? (
        <>
          <Loader2 className="mr-1 size-3.5 animate-spin" />
          Calculando...
        </>
      ) : (
        <>
          <Calculator className="mr-1 size-3.5" />
          Calcular
        </>
      )}
    </Button>
  )
}

function defaultPeriod(): string {
  // mes anterior por default
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function ComputeTitheButton() {
  const [state, action] = useFormState(
    computeTitheAction,
    initialState,
  )
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState(defaultPeriod())

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
        <Calculator className="mr-1 size-3.5" />
        Calcular periodo
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <form
            action={action}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Calcular diezmo del periodo
            </h3>

            {state.ok === false && state.message && (
              <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                {state.message}
              </div>
            )}
            {state.ok === true && state.message && (
              <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {state.message}
                {state.baseCalculo != null && (
                  <p className="mt-1 text-[10px]">
                    Base: {state.baseCalculo.toFixed(2)} · 10%:{" "}
                    {state.montoDiezmo?.toFixed(2)}
                  </p>
                )}
              </div>
            )}

            <label className="mb-1.5 block text-xs font-medium">
              Periodo (YYYY-MM)
            </label>
            <input
              type="month"
              name="period"
              required
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Suma todos los ingresos con aplica_diezmo=true en este mes y
              calcula el 10%. Re-correr es idempotente mientras esté pendiente
              de pago.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cerrar
              </Button>
              <SubmitButton />
            </div>
          </form>
        </div>
      )}
    </>
  )
}
