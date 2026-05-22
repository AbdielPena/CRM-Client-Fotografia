"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import {
  AlertCircle,
  Save,
  Loader2,
  Repeat,
  CreditCard,
  Calendar,
} from "lucide-react"

import {
  createFinSubscriptionAction,
  type FinSubscriptionActionState,
} from "@/server/actions/fin-subscription.actions"
import { frecuencias } from "@/lib/validations/fin-subscription.schema"
import { Button } from "@/components/ui/button"

const initialState: FinSubscriptionActionState = {}

const FRECUENCIA_LABELS: Record<(typeof frecuencias)[number], string> = {
  semanal: "Semanal (cada 7 días)",
  quincenal: "Quincenal (cada 15 días)",
  mensual: "Mensual",
  bimestral: "Bimestral (cada 2 meses)",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
}

type PaymentSource = "account" | "card"

export function NewSubscriptionForm({
  accounts,
  cards,
  categories,
}: {
  accounts: Array<{ id: string; nombre: string; currency: string }>
  cards: Array<{ id: string; descripcion: string }>
  categories: Array<{ id: string; nombre: string; tipo: string }>
}) {
  const [state, action] = useFormState(
    createFinSubscriptionAction,
    initialState,
  )
  const [source, setSource] = useState<PaymentSource>(
    accounts.length > 0 ? "account" : "card",
  )

  return (
    <form action={action} className="space-y-5">
      {state.ok === false && state.message && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="size-4" />
          {state.message}
        </div>
      )}

      {/* Datos principales */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Repeat className="mr-1 inline size-3.5" />
          Información básica
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="nombre"
              required
              defaultValue={state.values?.nombre}
              placeholder="Ej. Adobe Creative Cloud"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
            {state.fieldErrors?.nombre && (
              <p className="mt-1 text-[10px] text-red-600">
                {state.fieldErrors.nombre[0]}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium">
                Monto <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                name="monto"
                required
                defaultValue={state.values?.monto}
                placeholder="0.00"
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Moneda
              </label>
              <select
                name="currency"
                defaultValue={state.values?.currency ?? "DOP"}
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="DOP">DOP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Frecuencia + próxima fecha */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Calendar className="mr-1 inline size-3.5" />
          Cuándo se cobra
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Frecuencia <span className="text-red-500">*</span>
            </label>
            <select
              name="frecuencia"
              required
              defaultValue={state.values?.frecuencia ?? "mensual"}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              {frecuencias.map((f) => (
                <option key={f} value={f}>
                  {FRECUENCIA_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Día del mes (opcional)
            </label>
            <input
              type="number"
              min="1"
              max="31"
              name="diaCobro"
              defaultValue={state.values?.diaCobro}
              placeholder="Ej. 15"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Solo si frecuencia es mensual / bimestral. Para semanal o
              quincenal se ignora.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium">
            Próxima fecha de cobro <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            name="proximaFecha"
            required
            defaultValue={
              state.values?.proximaFecha ??
              new Date().toISOString().slice(0, 10)
            }
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            El cron diario procesará esta fecha. Después se avanza
            automáticamente al siguiente periodo según la frecuencia.
          </p>
        </div>
      </section>

      {/* De qué cuenta / tarjeta sale */}
      {(accounts.length > 0 || cards.length > 0) && (
        <section className="sf-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <CreditCard className="mr-1 inline size-3.5" />
            ¿De dónde se cobra?
          </h3>

          <div className="mb-4 flex gap-2 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setSource("account")}
              disabled={accounts.length === 0}
              className={
                "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
                (source === "account"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground") +
                (accounts.length === 0 ? " cursor-not-allowed opacity-50" : "")
              }
            >
              Cuenta bancaria
            </button>
            <button
              type="button"
              onClick={() => setSource("card")}
              disabled={cards.length === 0}
              className={
                "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
                (source === "card"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground") +
                (cards.length === 0 ? " cursor-not-allowed opacity-50" : "")
              }
            >
              Tarjeta
            </button>
          </div>

          {source === "account" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Cuenta
              </label>
              <select
                name="cuentaId"
                defaultValue={state.values?.cuentaId ?? ""}
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Selecciona —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre} ({a.currency})
                  </option>
                ))}
              </select>
              <input type="hidden" name="tarjetaId" value="" />
            </div>
          )}

          {source === "card" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Tarjeta
              </label>
              <select
                name="tarjetaId"
                defaultValue={state.values?.tarjetaId ?? ""}
                className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Selecciona —</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.descripcion}
                  </option>
                ))}
              </select>
              <input type="hidden" name="cuentaId" value="" />
            </div>
          )}
        </section>
      )}

      {/* Categoría */}
      {categories.length > 0 && (
        <section className="sf-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Categoría de gasto
          </h3>
          <select
            name="categoriaId"
            defaultValue={state.values?.categoriaId ?? ""}
            className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— Sin categoría —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Útil para reportes por categoría (software, servicios, etc.).
          </p>
        </section>
      )}

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
          Crear suscripción
        </>
      )}
    </Button>
  )
}
