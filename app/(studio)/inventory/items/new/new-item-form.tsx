"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { AlertCircle, Save, Loader2 } from "lucide-react"

import {
  createInvItemAction,
  type InvItemActionState,
} from "@/server/actions/inv-item.actions"
import { Button } from "@/components/ui/button"

const initialState: InvItemActionState = {}

export function NewItemForm() {
  const [state, formAction] = useFormState(createInvItemAction, initialState)
  const [kind, setKind] = useState<"serialized" | "bulk">("bulk")

  return (
    <form action={formAction} className="sf-card space-y-6 p-6">
      {state.ok === false && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-4" />
          {state.message}
        </div>
      )}

      {/* Kind selector — afecta UX (campo cantidad solo si bulk) */}
      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">
          Tipo de item <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <KindCard
            value="bulk"
            current={kind}
            onSelect={setKind}
            label="A granel"
            description="Contador de unidades. Ej: tarjetas SD, baterías, mástiles."
          />
          <KindCard
            value="serialized"
            current={kind}
            onSelect={setKind}
            label="Serializado"
            description="Cada unidad con N/S única. Ej: cámaras, lentes, drones."
          />
        </div>
        <input type="hidden" name="kind" value={kind} />
      </div>

      {/* Datos básicos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Nombre"
          name="name"
          required
          placeholder="Sony A7 IV / SD 64GB / etc."
          defaultValue={state.values?.name}
          errors={state.fieldErrors?.name}
        />
        <Field
          label="Código interno"
          name="internalCode"
          placeholder="CAM-001"
          defaultValue={state.values?.internalCode}
          hint="Único en tu studio (opcional). Útil para etiquetas y búsqueda."
          errors={state.fieldErrors?.internalCode}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Marca"
          name="brand"
          placeholder="Sony / Canon / Nikon"
          defaultValue={state.values?.brand}
          errors={state.fieldErrors?.brand}
        />
        <Field
          label="Modelo"
          name="model"
          placeholder="A7 IV / R5 / Z9"
          defaultValue={state.values?.model}
          errors={state.fieldErrors?.model}
        />
      </div>

      <Field
        label="Descripción"
        name="description"
        placeholder="Detalles, accesorios incluidos, condición específica..."
        textarea
        defaultValue={state.values?.description}
        errors={state.fieldErrors?.description}
      />

      {/* Quantity solo si bulk */}
      {kind === "bulk" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            type="number"
            label="Cantidad inicial"
            name="quantityTotal"
            required
            placeholder="0"
            defaultValue={state.values?.quantityTotal ?? "0"}
            min="0"
            errors={state.fieldErrors?.quantityTotal}
            hint="Total en inventario hoy."
          />
          <Field
            type="number"
            label="Stock mínimo"
            name="minStock"
            placeholder="0"
            defaultValue={state.values?.minStock ?? "0"}
            min="0"
            errors={state.fieldErrors?.minStock}
            hint="Alerta cuando caes por debajo."
          />
          <Field
            type="number"
            label="Stock máximo (opcional)"
            name="maxStock"
            placeholder="50"
            defaultValue={state.values?.maxStock}
            min="0"
            errors={state.fieldErrors?.maxStock}
          />
        </div>
      )}
      {kind === "serialized" && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
          Tras crear este item, agrega sus unidades individuales (con N/S, fecha
          de compra, condición, etc.) desde la página de detalle.
        </p>
      )}

      {/* Precios y proveedor */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field
          type="number"
          label="Precio compra (DOP/USD)"
          name="defaultPurchasePrice"
          placeholder="0.00"
          step="0.01"
          min="0"
          defaultValue={state.values?.defaultPurchasePrice}
          errors={state.fieldErrors?.defaultPurchasePrice}
        />
        <Field
          type="number"
          label="Valor estimado"
          name="defaultEstimatedValue"
          placeholder="0.00"
          step="0.01"
          min="0"
          defaultValue={state.values?.defaultEstimatedValue}
          errors={state.fieldErrors?.defaultEstimatedValue}
          hint="Para seguros y penalidades por pérdida."
        />
        <Field
          type="number"
          label="Renta / día"
          name="defaultRentalPricePerDay"
          placeholder="0.00"
          step="0.01"
          min="0"
          defaultValue={state.values?.defaultRentalPricePerDay}
          errors={state.fieldErrors?.defaultRentalPricePerDay}
        />
      </div>

      <Field
        label="Proveedor"
        name="provider"
        placeholder="B&H Photo / Local..."
        defaultValue={state.values?.provider}
        errors={state.fieldErrors?.provider}
      />

      <Field
        label="Notas internas"
        name="notes"
        placeholder="Cualquier observación adicional..."
        textarea
        defaultValue={state.values?.notes}
        errors={state.fieldErrors?.notes}
      />

      {/* Submit */}
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
        <Loader2 className="mr-1 size-4 animate-spin" />
      ) : (
        <Save className="mr-1 size-4" />
      )}
      {pending ? "Guardando..." : "Crear item"}
    </Button>
  )
}

function KindCard({
  value,
  current,
  onSelect,
  label,
  description,
}: {
  value: "bulk" | "serialized"
  current: "bulk" | "serialized"
  onSelect: (v: "bulk" | "serialized") => void
  label: string
  description: string
}) {
  const selected = current === value
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={
        "rounded-xl border p-3 text-left transition-colors " +
        (selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
          : "border-input bg-background hover:bg-accent/50")
      }
    >
      <div className="flex items-center justify-between">
        <span className={"font-medium " + (selected ? "text-primary" : "text-foreground")}>
          {label}
        </span>
        {selected && (
          <span className="size-2 rounded-full bg-primary" aria-hidden />
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
    </button>
  )
}

function Field({
  label,
  name,
  required,
  defaultValue,
  placeholder,
  hint,
  type = "text",
  step,
  min,
  textarea,
  errors,
}: {
  label: string
  name: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
  hint?: string
  type?: string
  step?: string
  min?: string
  textarea?: boolean
  errors?: string[]
}) {
  const inputClass =
    "block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {textarea ? (
        <textarea
          name={name}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          rows={3}
          className={inputClass + " resize-y"}
        />
      ) : (
        <input
          type={type}
          name={name}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          step={step}
          min={min}
          className={inputClass}
        />
      )}
      {hint && !errors?.[0] && (
        <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
      )}
      {errors?.[0] && <p className="mt-1 text-[10px] text-red-600">{errors[0]}</p>}
    </div>
  )
}
