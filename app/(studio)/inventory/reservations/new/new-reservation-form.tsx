"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import {
  AlertCircle,
  Save,
  Loader2,
  Plus,
  Trash2,
  CalendarClock,
} from "lucide-react"

import {
  createInvReservationAction,
  type InvReservationActionState,
} from "@/server/actions/inv-reservation.actions"
import { Button } from "@/components/ui/button"

type Item = {
  id: string
  name: string
  kind: string
  brand: string | null
}

type Client = { id: string; name: string }
type Responsible = {
  id: string
  full_name: string
  department: string | null
  position: string | null
}

type LineItem = {
  itemId: string
  quantity: number
}

type ReservedFor = "client" | "responsible"

const initialState: InvReservationActionState = {}

export function NewReservationForm({
  items,
  clients,
  responsibles,
}: {
  items: Item[]
  clients: Client[]
  responsibles: Responsible[]
}) {
  const [state, action] = useFormState(
    createInvReservationAction,
    initialState,
  )
  const [lines, setLines] = useState<LineItem[]>([
    { itemId: "", quantity: 1 },
  ])
  const [reservedFor, setReservedFor] = useState<ReservedFor>(
    clients.length > 0 ? "client" : "responsible",
  )

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

      {/* Reservada para */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <CalendarClock className="mr-1 inline size-3.5" />
          Reservada para
        </h3>

        <div className="mb-4 flex gap-2 rounded-xl bg-muted p-1">
          <button
            type="button"
            onClick={() => setReservedFor("client")}
            disabled={clients.length === 0}
            className={
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
              (reservedFor === "client"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground") +
              (clients.length === 0 ? " cursor-not-allowed opacity-50" : "")
            }
          >
            Cliente
          </button>
          <button
            type="button"
            onClick={() => setReservedFor("responsible")}
            disabled={responsibles.length === 0}
            className={
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
              (reservedFor === "responsible"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground") +
              (responsibles.length === 0 ? " cursor-not-allowed opacity-50" : "")
            }
          >
            Responsible interno
          </button>
        </div>

        {reservedFor === "client" && (
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
              <option value="">— Selecciona —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input type="hidden" name="responsibleId" value="" />
          </div>
        )}

        {reservedFor === "responsible" && (
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Responsible interno <span className="text-red-500">*</span>
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
                </option>
              ))}
            </select>
            <input type="hidden" name="clientId" value="" />
          </div>
        )}
      </section>

      {/* Periodo */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Periodo de reserva
        </h3>
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
                new Date(Date.now() + 86400000)
                  .toISOString()
                  .slice(0, 16)
              }
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Fin <span className="text-red-500">*</span>
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
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium">
            Expira si no se confirma antes de (opcional)
          </label>
          <input
            type="datetime-local"
            name="expiresAt"
            defaultValue={state.values?.expiresAt}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Si no se confirma antes de esta fecha, la reserva pasa a status
            "vencida" automáticamente (cron).
          </p>
        </div>
      </section>

      {/* Items reservados */}
      <section className="sf-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Equipos a reservar
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
              <div className="col-span-12 sm:col-span-8">
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
                      {it.kind === "serialized" ? " · serializado" : ""}
                    </option>
                  ))}
                </select>
                <input
                  type="hidden"
                  name={`items[${idx}][itemId]`}
                  value={line.itemId}
                />
              </div>
              <div className="col-span-8 sm:col-span-3">
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
              <div className="col-span-4 sm:col-span-1 flex justify-end">
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
        <label className="mb-1.5 block text-xs font-medium">
          Razón / Notas
        </label>
        <textarea
          name="reason"
          rows={3}
          defaultValue={state.values?.reason}
          placeholder="Sesión XX, evento, etc."
          className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <SubmitButton />
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-1 size-4 animate-spin" />
          Creando...
        </>
      ) : (
        <>
          <Save className="mr-1 size-4" />
          Crear reserva
        </>
      )}
    </Button>
  )
}
