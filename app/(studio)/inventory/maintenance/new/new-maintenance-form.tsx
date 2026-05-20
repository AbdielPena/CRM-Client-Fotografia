"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { AlertCircle, Save, Loader2, Wrench } from "lucide-react"

import {
  createInvMaintenanceAction,
  type InvMaintActionState,
} from "@/server/actions/inv-maintenance.actions"
import { maintenanceTypes } from "@/lib/validations/inv-maintenance.schema"
import { Button } from "@/components/ui/button"

type Item = {
  id: string
  name: string
  kind: string
  brand: string | null
}

const initialState: InvMaintActionState = {}

const TYPE_LABELS: Record<(typeof maintenanceTypes)[number], string> = {
  preventivo: "Preventivo · revisión rutinaria",
  correctivo: "Correctivo · arreglar un fallo",
  limpieza: "Limpieza · sensor / lentes",
  revision: "Revisión · diagnóstico",
  reparacion: "Reparación",
  calibracion: "Calibración",
  cambio_pieza: "Cambio de pieza",
}

export function NewMaintenanceForm({
  items,
  prefillItemId,
  prefillItemUnitId,
}: {
  items: Item[]
  prefillItemId?: string
  prefillItemUnitId?: string
}) {
  const [state, action] = useFormState(
    createInvMaintenanceAction,
    initialState,
  )
  const [selectedItemId, setSelectedItemId] = useState(prefillItemId ?? "")
  const [startNow, setStartNow] = useState(false)

  return (
    <form action={action} className="space-y-5">
      {state.ok === false && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-4" />
          {state.message}
        </div>
      )}

      {/* Equipo */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Wrench className="mr-1 inline size-3.5" />
          Equipo a mantener
        </h3>

        {prefillItemUnitId ? (
          <div className="rounded-lg bg-muted px-3 py-2 text-xs">
            Unidad pre-seleccionada (desde detalle de unidad):{" "}
            <strong className="font-mono">{prefillItemUnitId}</strong>
            <input type="hidden" name="itemUnitId" value={prefillItemUnitId} />
            <input
              type="hidden"
              name="itemId"
              value={prefillItemId ?? selectedItemId}
            />
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Item <span className="text-red-500">*</span>
            </label>
            <select
              name="itemId"
              required
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— Selecciona —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} {it.brand && `· ${it.brand}`}
                  {it.kind === "serialized" ? " · serializado" : " · bulk"}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Para mantenimiento de una unidad serializada específica, ve al
              detalle de la unidad y abre desde ahí.
            </p>
          </div>
        )}
      </section>

      {/* Tipo + técnico */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Tipo de mantenimiento
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Tipo <span className="text-red-500">*</span>
            </label>
            <select
              name="type"
              required
              defaultValue={state.values?.type ?? "correctivo"}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              {maintenanceTypes.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Técnico / Taller
            </label>
            <input
              type="text"
              name="technician"
              defaultValue={state.values?.technician}
              placeholder="Ej. Juan Pérez o Servicios Foto SRL"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium">
            Descripción del problema
          </label>
          <textarea
            name="description"
            rows={2}
            defaultValue={state.values?.description}
            placeholder="Ej. Sensor con manchas tras último viaje a la playa"
            className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium">
            Costo estimado (DOP)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            name="estimatedCost"
            defaultValue={state.values?.estimatedCost}
            placeholder="0.00"
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Puedes actualizarlo al completar el mantenimiento.
          </p>
        </div>
      </section>

      {/* Iniciar ahora */}
      <section className="sf-card p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="startNow"
            checked={startNow}
            onChange={(e) => setStartNow(e.target.checked)}
            className="mt-0.5 rounded border-input"
          />
          <div>
            <p className="text-sm font-medium">Iniciar ahora</p>
            <p className="text-xs text-muted-foreground">
              Si está activado, el record se crea con status{" "}
              <code className="rounded bg-muted px-1">en_proceso</code> y la
              unidad se mueve a status{" "}
              <code className="rounded bg-muted px-1">mantenimiento</code>{" "}
              (deja de estar disponible). Si está desactivado, queda{" "}
              <code className="rounded bg-muted px-1">pendiente</code>.
            </p>
          </div>
        </label>
      </section>

      <div>
        <label className="mb-1.5 block text-xs font-medium">Notas</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={state.values?.notes}
          placeholder="Información adicional, contactos, presupuesto..."
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
          Registrar mantenimiento
        </>
      )}
    </Button>
  )
}
