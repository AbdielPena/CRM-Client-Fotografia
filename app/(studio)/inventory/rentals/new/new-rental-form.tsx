"use client"

import { useActionState, useState } from "react"
import {
  AlertCircle,
  Save,
  Loader2,
  Plus,
  Trash2,
  Package as PackageIcon,
} from "lucide-react"

import {
  createInvRentalAction,
  type InvRentalActionState,
} from "@/server/actions/inv-rental.actions"
import { Button } from "@/components/ui/button"

type Item = {
  id: string
  name: string
  kind: string
  brand: string | null
  defaultRentalPricePerDay: number
}

type LineItem = {
  itemId: string
  quantity: number
  pricePerDay: number
  notes?: string
}

const initialState: InvRentalActionState = {}

export function NewRentalForm({
  items,
  clients,
  projects,
}: {
  items: Item[]
  clients: Array<{ id: string; name: string }>
  projects: Array<{ id: string; name: string }>
}) {
  const [state, action, pending] = useActionState(
    createInvRentalAction,
    initialState,
  )
  const [lines, setLines] = useState<LineItem[]>([
    { itemId: "", quantity: 1, pricePerDay: 0 },
  ])

  function addLine() {
    setLines((prev) => [...prev, { itemId: "", quantity: 1, pricePerDay: 0 }])
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateLine<K extends keyof LineItem>(
    idx: number,
    key: K,
    value: LineItem[K],
  ) {
    setLines((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [key]: value }
      // Auto-fill pricePerDay si se selecciona un item con default
      if (key === "itemId") {
        const found = items.find((i) => i.id === value)
        if (found && next[idx].pricePerDay === 0) {
          next[idx].pricePerDay = found.defaultRentalPricePerDay
        }
      }
      return next
    })
  }

  // Cálculos preview
  const startDate = (typeof window !== "undefined"
    ? (document.querySelector('input[name="startDate"]') as HTMLInputElement)?.value
    : "") || new Date().toISOString().slice(0, 10)
  const endDate = (typeof window !== "undefined"
    ? (document.querySelector('input[name="endDate"]') as HTMLInputElement)?.value
    : "") || ""
  const days =
    endDate && startDate
      ? Math.max(
          1,
          Math.ceil(
            (new Date(endDate).getTime() - new Date(startDate).getTime()) /
              86_400_000,
          ),
        )
      : 1
  const subtotal = lines.reduce(
    (acc, l) => acc + l.quantity * l.pricePerDay * days,
    0,
  )

  return (
    <form action={action} className="space-y-5">
      {state.ok === false && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-4" />
          {state.message}
        </div>
      )}

      {/* Cliente + periodo + project */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Datos básicos
        </h3>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Cliente <span className="text-red-500">*</span>
            </label>
            <select
              name="clientId"
              required
              defaultValue={state.values?.clientId ?? ""}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— Selecciona cliente del CRM —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Fecha inicio <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                name="startDate"
                required
                defaultValue={
                  state.values?.startDate ??
                  new Date().toISOString().slice(0, 16)
                }
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Fecha fin <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                name="endDate"
                required
                defaultValue={state.values?.endDate}
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          {projects.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Proyecto del CRM (opcional)
              </label>
              <select
                name="projectId"
                defaultValue={state.values?.projectId ?? ""}
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Sin vincular —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {/* Items del alquiler */}
      <section className="sf-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Equipos a rentar
          </h3>
          <Button type="button" size="sm" variant="outline" onClick={addLine}>
            <Plus className="mr-1 size-3" />
            Añadir línea
          </Button>
        </div>

        <ul className="space-y-3">
          {lines.map((line, idx) => (
            <li
              key={idx}
              className="grid grid-cols-12 items-end gap-2 rounded-xl border border-border p-3"
            >
              <div className="col-span-12 sm:col-span-6">
                <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">
                  Item
                </label>
                <select
                  required
                  value={line.itemId}
                  onChange={(e) => updateLine(idx, "itemId", e.target.value)}
                  className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">— Selecciona —</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} {it.brand && `· ${it.brand}`}
                    </option>
                  ))}
                </select>
                <input
                  type="hidden"
                  name={`items[${idx}][itemId]`}
                  value={line.itemId}
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">
                  Cantidad
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={line.quantity}
                  onChange={(e) =>
                    updateLine(idx, "quantity", Number(e.target.value))
                  }
                  className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
                <input
                  type="hidden"
                  name={`items[${idx}][quantity]`}
                  value={line.quantity}
                />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">
                  $ / día
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={line.pricePerDay}
                  onChange={(e) =>
                    updateLine(idx, "pricePerDay", Number(e.target.value))
                  }
                  className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
                <input
                  type="hidden"
                  name={`items[${idx}][pricePerDay]`}
                  value={line.pricePerDay}
                />
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-end">
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    title="Eliminar línea"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Resumen + descuento + impuestos + depósito */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Ajustes
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Descuento</label>
            <input
              type="number"
              name="discount"
              step="0.01"
              min="0"
              placeholder="0.00"
              defaultValue={state.values?.discount}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Impuesto</label>
            <input
              type="number"
              name="tax"
              step="0.01"
              min="0"
              placeholder="0.00"
              defaultValue={state.values?.tax}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Depósito (garantía)</label>
            <input
              type="number"
              name="deposit"
              step="0.01"
              min="0"
              placeholder="0.00"
              defaultValue={state.values?.deposit}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-muted/40 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal estimado</span>
            <span className="font-bold tabular-nums">${subtotal.toFixed(2)}</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Calculado con {days} día(s). El total final se computa al guardar.
          </p>
        </div>
      </section>

      <div>
        <label className="mb-1.5 block text-xs font-medium">Notas</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={state.values?.notes}
          placeholder="Términos especiales, condiciones, etc."
          className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-1 size-4 animate-spin" />
              Creando...
            </>
          ) : (
            <>
              <Save className="mr-1 size-4" />
              Crear alquiler
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
