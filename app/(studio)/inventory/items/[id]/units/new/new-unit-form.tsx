"use client"

import { useActionState } from "react"
import {
  AlertCircle,
  Save,
  Loader2,
  Hash,
  QrCode,
  MapPin,
  DollarSign,
  ShieldCheck,
} from "lucide-react"

import {
  createInvItemUnitAction,
  type InvUnitActionState,
} from "@/server/actions/inv-item-unit.actions"
import { Button } from "@/components/ui/button"

const initialState: InvUnitActionState = {}

export function NewUnitForm({
  itemId,
  itemName,
  locations,
}: {
  itemId: string
  itemName: string
  locations: Array<{ id: string; name: string }>
}) {
  const [state, action, pending] = useActionState(
    createInvItemUnitAction,
    initialState,
  )

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="itemId" value={itemId} />

      {state.ok === false && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-4" />
          {state.message}
        </div>
      )}

      <div className="rounded-xl bg-muted px-4 py-3 text-xs">
        <p className="text-muted-foreground">Vas a agregar una unidad de:</p>
        <p className="mt-0.5 text-sm font-semibold">{itemName}</p>
      </div>

      {/* Identificación */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Hash className="mr-1 inline size-3.5" />
          Identificación
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Número de serie
            </label>
            <input
              type="text"
              name="serialNumber"
              defaultValue={state.values?.serialNumber}
              placeholder="Ej. SC0125000012"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
            />
            {state.fieldErrors?.serialNumber && (
              <p className="mt-1 text-[10px] text-red-600">
                {state.fieldErrors.serialNumber[0]}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Código interno
            </label>
            <input
              type="text"
              name="internalCode"
              defaultValue={state.values?.internalCode}
              placeholder="Ej. CAM-001"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              <QrCode className="mr-1 inline size-3" />
              QR code (string interno o URL)
            </label>
            <input
              type="text"
              name="qrCode"
              defaultValue={state.values?.qrCode}
              placeholder="Ej. ABBYPX-2025-CAM-001"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Barcode</label>
            <input
              type="text"
              name="barcode"
              defaultValue={state.values?.barcode}
              placeholder="Si el equipo lo tiene"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>
      </section>

      {/* Condición + ubicación */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <MapPin className="mr-1 inline size-3.5" />
          Condición + ubicación
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Condición física
            </label>
            <input
              type="text"
              name="physicalCondition"
              defaultValue={state.values?.physicalCondition ?? "Excelente"}
              placeholder="Excelente, Bueno, Usado..."
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Condición operativa
            </label>
            <input
              type="text"
              name="operationalCondition"
              defaultValue={state.values?.operationalCondition ?? "Funcional"}
              placeholder="Funcional, Necesita reparación..."
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          {locations.length > 0 && (
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium">
                Ubicación actual
              </label>
              <select
                name="currentLocationId"
                defaultValue={state.values?.currentLocationId ?? ""}
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Sin ubicación —</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {/* Compra + garantía */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <DollarSign className="mr-1 inline size-3.5" />
          Compra + garantía
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Fecha de compra
            </label>
            <input
              type="date"
              name="purchaseDate"
              defaultValue={state.values?.purchaseDate}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Precio de compra (DOP)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="purchasePrice"
              defaultValue={state.values?.purchasePrice}
              placeholder="0.00"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Valor estimado actual (DOP)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="estimatedValue"
              defaultValue={state.values?.estimatedValue}
              placeholder="0.00"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Útil para seguros y cobertura de daños.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              <ShieldCheck className="mr-1 inline size-3" />
              Garantía hasta
            </label>
            <input
              type="date"
              name="warrantyExpiry"
              defaultValue={state.values?.warrantyExpiry}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium">
              Proveedor
            </label>
            <input
              type="text"
              name="provider"
              defaultValue={state.values?.provider}
              placeholder="Ej. B&H Photo, Adorama, etc."
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      <div>
        <label className="mb-1.5 block text-xs font-medium">Notas</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={state.values?.notes}
          placeholder="Accesorios incluidos, observaciones, etc."
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
              Agregar unidad
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
