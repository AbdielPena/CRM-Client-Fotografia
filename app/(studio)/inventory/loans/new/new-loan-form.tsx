"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import {
  AlertCircle,
  Save,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react"

import {
  createInvLoanAction,
  type InvLoanActionState,
} from "@/server/actions/inv-loan.actions"
import { Button } from "@/components/ui/button"

type Item = {
  id: string
  name: string
  kind: string
  brand: string | null
}

type Responsible = {
  id: string
  full_name: string
  department: string | null
  position: string | null
}

type LineItem = {
  itemId: string
  quantity: number
  conditionOut?: string
  notes?: string
}

const initialState: InvLoanActionState = {}

export function NewLoanForm({
  items,
  responsibles,
  projects,
  bookings,
}: {
  items: Item[]
  responsibles: Responsible[]
  projects: Array<{ id: string; name: string }>
  bookings: Array<{ id: string; event_date: string; event_type: string }>
}) {
  const [state, action] = useFormState(
    createInvLoanAction,
    initialState,
  )
  const [lines, setLines] = useState<LineItem[]>([
    { itemId: "", quantity: 1 },
  ])

  function addLine() {
    setLines((prev) => [...prev, { itemId: "", quantity: 1 }])
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
      return next
    })
  }

  return (
    <form action={action} className="space-y-5">
      {state.ok === false && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-4" />
          {state.message}
        </div>
      )}

      {/* Responsible + periodo */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Responsible + periodo
        </h3>

        {responsibles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            No tienes responsibles internos registrados. Primero crea uno desde
            <strong> /inventory/responsibles</strong> (próximo PR — actualmente
            se puede insertar manualmente vía Supabase SQL).
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Responsible <span className="text-red-500">*</span>
              </label>
              <select
                name="responsibleId"
                required
                defaultValue={state.values?.responsibleId ?? ""}
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Selecciona —</option>
                {responsibles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name}
                    {r.department && ` · ${r.department}`}
                    {r.position && ` (${r.position})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Inicio <span className="text-red-500">*</span>
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
                  Devolución esperada <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  name="expectedReturnDate"
                  required
                  defaultValue={state.values?.expectedReturnDate}
                  className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Vinculación cross-módulo CRM */}
      {(projects.length > 0 || bookings.length > 0) && (
        <section className="sf-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Vincular al CRM (opcional)
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {projects.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Proyecto
                </label>
                <select
                  name="projectId"
                  defaultValue={state.values?.projectId ?? ""}
                  className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— Ninguno —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {bookings.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Sesión / Booking
                </label>
                <select
                  name="bookingId"
                  defaultValue={state.values?.bookingId ?? ""}
                  className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— Ninguno —</option>
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {new Date(b.event_date).toLocaleDateString("es-DO")} ·{" "}
                      {b.event_type}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Solo bookings futuros mostrados.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Items prestados */}
      <section className="sf-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Equipos a prestar
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
                  Condición salida
                </label>
                <input
                  type="text"
                  placeholder="Bueno, usado..."
                  value={line.conditionOut ?? ""}
                  onChange={(e) =>
                    updateLine(idx, "conditionOut", e.target.value)
                  }
                  className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
                <input
                  type="hidden"
                  name={`items[${idx}][conditionOut]`}
                  value={line.conditionOut ?? ""}
                />
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-end">
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    title="Eliminar"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div>
        <label className="mb-1.5 block text-xs font-medium">Notas</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={state.values?.notes}
          placeholder="Propósito del préstamo, condiciones, etc."
          className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <SubmitButton disabled={responsibles.length === 0} />
      </div>
    </form>
  )
}

function SubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? (
        <>
          <Loader2 className="mr-1 size-4 animate-spin" />
          Creando...
        </>
      ) : (
        <>
          <Save className="mr-1 size-4" />
          Registrar préstamo
        </>
      )}
    </Button>
  )
}
