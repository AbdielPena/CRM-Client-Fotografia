"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { AlertCircle, CheckCircle2, Plus, Save, Landmark } from "lucide-react"

import {
  createFinAccountAction,
  createFinBankAction,
  type FinAccountActionState,
  type FinBankActionState,
} from "@/server/actions/fin-account.actions"
import { Button } from "@/components/ui/button"

type Bank = {
  id: string
  nombre: string
  color: string | null
  icono: string | null
}

const initialAccountState: FinAccountActionState = {}
const initialBankState: FinBankActionState = {}

function CreateAccountSubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled}>
      <Save className="mr-1 size-4" />
      {pending ? "Guardando..." : "Crear cuenta"}
    </Button>
  )
}

function CreateBankSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Creando..." : "Crear banco"}
    </Button>
  )
}

export function NewAccountForm({ banks: initialBanks }: { banks: Bank[] }) {
  const [accountState, accountAction] = useFormState(
    createFinAccountAction,
    initialAccountState,
  )
  const [banks, setBanks] = useState(initialBanks)
  const [showBankForm, setShowBankForm] = useState(initialBanks.length === 0)

  return (
    <div className="space-y-4">
      {/* Form para crear banco si no hay o si user clickea "Crear banco" */}
      {showBankForm && (
        <CreateBankInlineForm
          onCreated={(b) => {
            setBanks((prev) => [...prev, b])
            setShowBankForm(false)
          }}
        />
      )}

      {/* Form principal de cuenta */}
      <form action={accountAction} className="sf-card space-y-6 p-6">
        {accountState.ok === false && accountState.message && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="size-4" />
            {accountState.message}
          </div>
        )}

        {/* Banco selector */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium text-foreground">
              Banco <span className="text-red-500">*</span>
            </label>
            {!showBankForm && (
              <button
                type="button"
                onClick={() => setShowBankForm(true)}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <Plus className="size-3" />
                Crear nuevo banco
              </button>
            )}
          </div>
          {banks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
              Primero crea un banco arriba para asignar esta cuenta.
            </p>
          ) : (
            <select
              name="bancoId"
              required
              defaultValue={accountState.values?.bancoId ?? ""}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Selecciona banco —</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.icono} {b.nombre}
                </option>
              ))}
            </select>
          )}
          {accountState.fieldErrors?.bancoId?.[0] && (
            <p className="mt-1 text-[10px] text-red-600">
              {accountState.fieldErrors.bancoId[0]}
            </p>
          )}
        </div>

        {/* Datos básicos */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Nombre de la cuenta"
            name="nombre"
            required
            placeholder="Ej: Cuenta principal, Caja chica"
            defaultValue={accountState.values?.nombre}
            errors={accountState.fieldErrors?.nombre}
          />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Tipo
            </label>
            <select
              name="tipo"
              defaultValue={accountState.values?.tipo ?? ""}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Sin especificar —</option>
              <option value="ahorro">Ahorro</option>
              <option value="corriente">Corriente</option>
              <option value="nomina">Nómina</option>
              <option value="efectivo">Efectivo</option>
              <option value="digital">Digital (Paypal, Wally, etc.)</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            type="number"
            label="Saldo inicial"
            name="saldoInicial"
            placeholder="0.00"
            step="0.01"
            defaultValue={accountState.values?.saldoInicial ?? "0"}
            errors={accountState.fieldErrors?.saldoInicial}
            hint="Saldo al momento de registrar la cuenta. Puede ser negativo (deuda)."
          />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Moneda
            </label>
            <select
              name="currency"
              defaultValue={accountState.values?.currency ?? "DOP"}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="DOP">DOP — Peso dominicano</option>
              <option value="USD">USD — Dólar EE.UU.</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </div>
        </div>

        <input type="hidden" name="activa" value="true" />

        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <CreateAccountSubmitButton disabled={banks.length === 0} />
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Crear banco inline (form sub-flujo)
// ---------------------------------------------------------------------------

function CreateBankInlineForm({ onCreated }: { onCreated: (b: Bank) => void }) {
  const [state, action] = useFormState(
    createFinBankAction,
    initialBankState,
  )

  // Si succeed, notificar al parent. useActionState devuelve state.bankId
  // tras success — usamos useEffect-like trigger.
  if (state.ok && state.bankId && state.values) {
    onCreated({
      id: state.bankId,
      nombre: state.values.nombre ?? "",
      color: state.values.color ?? null,
      icono: state.values.icono ?? null,
    })
  }

  return (
    <form action={action} className="sf-card space-y-3 p-5">
      <div className="flex items-center gap-2">
        <Landmark className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Crear nuevo banco</h3>
      </div>

      {state.ok === false && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-3" />
          {state.message}
        </div>
      )}
      {state.ok === true && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="size-3" />
          {state.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="nombre"
            required
            placeholder="Banreservas, BHD León, Popular, etc."
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Emoji
          </label>
          <input
            type="text"
            name="icono"
            placeholder="🏦"
            maxLength={4}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">
          Color (hex)
        </label>
        <input
          type="text"
          name="color"
          placeholder="#7C3AED"
          pattern="^#[0-9A-Fa-f]{6}$"
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="flex justify-end">
        <CreateBankSubmitButton />
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

function Field({
  label,
  name,
  required,
  defaultValue,
  placeholder,
  hint,
  type = "text",
  step,
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
  errors?: string[]
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        step={step}
        className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {hint && !errors?.[0] && (
        <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
      )}
      {errors?.[0] && <p className="mt-1 text-[10px] text-red-600">{errors[0]}</p>}
    </div>
  )
}
