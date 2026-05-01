"use client"

import { useEffect, useMemo, useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { toast } from "sonner"
import Link from "next/link"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import {
  createClientAction,
  type CreateClientState,
} from "@/server/actions/client.actions"
import { formatCurrency } from "@/lib/utils/currency"

export interface PackageOption {
  id: string
  name: string
  description: string | null
  price: number
  currency: string
  isActive: boolean
}

interface NewClientFormProps {
  packages: PackageOption[]
  hasContractTemplate: boolean
}

const SOURCES = [
  { value: "referral", label: "Referido" },
  { value: "website", label: "Sitio web" },
  { value: "social_media", label: "Redes sociales" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "public_link", label: "Link público" },
  { value: "other", label: "Otro" },
]

const EVENT_TYPES = [
  { value: "quinceañera", label: "Quinceañera (XV años)" },
  { value: "wedding", label: "Boda" },
  { value: "portrait", label: "Sesión de retrato" },
  { value: "family", label: "Familia" },
  { value: "newborn", label: "Recién nacido" },
  { value: "corporate", label: "Corporativo" },
  { value: "event", label: "Evento" },
  { value: "other", label: "Otro" },
]

const initialState: CreateClientState = {}

function todayIso(): string {
  const t = new Date()
  return t.toISOString().slice(0, 10)
}

function SubmitButton({ label, disabledReason }: { label: string; disabledReason?: string }) {
  const { pending } = useFormStatus()
  const disabled = pending || !!disabledReason
  return (
    <button
      type="submit"
      disabled={disabled}
      title={disabledReason}
      className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Creando cliente…" : label}
    </button>
  )
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
      <AlertCircle className="h-3 w-3 flex-shrink-0" />
      {errors[0]}
    </p>
  )
}

export function NewClientForm({ packages, hasContractTemplate }: NewClientFormProps) {
  const [state, formAction] = useFormState(createClientAction, initialState)

  const activePackages = useMemo(() => packages.filter((p) => p.isActive), [packages])

  const [packageId, setPackageId] = useState<string>(activePackages[0]?.id ?? "")
  const [eventDate, setEventDate] = useState<string>(state.values?.eventDate ?? "")

  // Tras error, re-hidratar el selector con lo que el usuario tenía.
  useEffect(() => {
    if (state.values?.packageId) setPackageId(state.values.packageId)
    if (state.values?.eventDate) setEventDate(state.values.eventDate)
  }, [state.values?.packageId, state.values?.eventDate])

  // Toast de error de formulario (no de campo)
  useEffect(() => {
    if (state.ok === false && state.message) {
      toast.error(state.message)
    }
  }, [state.ok, state.message])

  const selectedPackage = activePackages.find((p) => p.id === packageId) ?? null
  const total = selectedPackage ? Number(selectedPackage.price) : 0
  const half = Math.round(total * 50) / 100
  const remainder = Math.round((total - half) * 100) / 100
  const currency = selectedPackage?.currency ?? "USD"

  const disabledReason = !hasContractTemplate
    ? "Configura una plantilla de contrato antes de crear clientes."
    : activePackages.length === 0
      ? "Crea al menos un paquete activo antes de registrar clientes."
      : undefined

  const values = state.values ?? {}
  const fieldErrors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {/* Aviso general */}
      {state.ok === false && state.message && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">No pudimos crear el cliente</p>
            <p>{state.message}</p>
          </div>
        </div>
      )}

      {disabledReason && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Acción requerida</p>
            <p>{disabledReason}</p>
            {activePackages.length === 0 && (
              <Link
                href="/settings/packages"
                className="underline font-medium mt-1 inline-block"
              >
                Ir a paquetes →
              </Link>
            )}
            {!hasContractTemplate && (
              <Link
                href="/settings/contracts"
                className="underline font-medium mt-1 inline-block"
              >
                Ir a plantillas de contrato →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Información básica */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Información del cliente</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre completo <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            required
            defaultValue={values.name ?? ""}
            aria-invalid={!!fieldErrors.name}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
              fieldErrors.name
                ? "border-red-400 focus:border-red-500"
                : "border-gray-200 focus:border-blue-400"
            }`}
            placeholder="Ej. María Fernández"
          />
          <FieldError errors={fieldErrors.name} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              name="email"
              type="email"
              defaultValue={values.email ?? ""}
              aria-invalid={!!fieldErrors.email}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                fieldErrors.email
                  ? "border-red-400 focus:border-red-500"
                  : "border-gray-200 focus:border-blue-400"
              }`}
              placeholder="correo@ejemplo.com"
            />
            <FieldError errors={fieldErrors.email} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input
              name="phone"
              type="tel"
              defaultValue={values.phone ?? ""}
              aria-invalid={!!fieldErrors.phone}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                fieldErrors.phone
                  ? "border-red-400 focus:border-red-500"
                  : "border-gray-200 focus:border-blue-400"
              }`}
              placeholder="+1 809 555 0000"
            />
            <FieldError errors={fieldErrors.phone} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ¿Cómo nos conoció?
          </label>
          <select
            name="source"
            defaultValue={values.source ?? ""}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
          >
            <option value="">No especificado</option>
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Paquete + sesión (obligatorio) */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Paquete y sesión</h2>
          <p className="text-xs text-gray-500 mt-1">
            Obligatorio. Al guardar se generarán automáticamente el proyecto, el contrato y
            las facturas 50 / 50.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Paquete <span className="text-red-500">*</span>
          </label>
          <select
            name="packageId"
            required
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            aria-invalid={!!fieldErrors.packageId}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white ${
              fieldErrors.packageId
                ? "border-red-400 focus:border-red-500"
                : "border-gray-200 focus:border-blue-400"
            }`}
          >
            <option value="">— Selecciona un paquete —</option>
            {activePackages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatCurrency(Number(p.price), p.currency)}
              </option>
            ))}
          </select>
          <FieldError errors={fieldErrors.packageId} />
        </div>

        {selectedPackage && (
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
            <p className="font-medium">{selectedPackage.name}</p>
            {selectedPackage.description && (
              <p className="text-xs text-blue-800 mt-1">{selectedPackage.description}</p>
            )}
            <dl className="grid grid-cols-3 gap-2 mt-3 text-xs">
              <div>
                <dt className="text-blue-700/70">Total</dt>
                <dd className="font-semibold text-blue-900">
                  {formatCurrency(total, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-blue-700/70">Reserva (50 %)</dt>
                <dd className="font-semibold text-blue-900">
                  {formatCurrency(half, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-blue-700/70">Saldo (50 %)</dt>
                <dd className="font-semibold text-blue-900">
                  {formatCurrency(remainder, currency)}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de sesión <span className="text-red-500">*</span>
            </label>
            <select
              name="eventType"
              required
              defaultValue={values.eventType ?? "quinceañera"}
              aria-invalid={!!fieldErrors.eventType}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white ${
                fieldErrors.eventType
                  ? "border-red-400 focus:border-red-500"
                  : "border-gray-200 focus:border-blue-400"
              }`}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <FieldError errors={fieldErrors.eventType} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de la sesión <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="eventDate"
              required
              value={eventDate}
              min={todayIso()}
              onChange={(e) => setEventDate(e.target.value)}
              aria-invalid={!!fieldErrors.eventDate}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white ${
                fieldErrors.eventDate
                  ? "border-red-400 focus:border-red-500"
                  : "border-gray-200 focus:border-blue-400"
              }`}
            />
            <FieldError errors={fieldErrors.eventDate} />
            <p className="mt-1 text-xs text-gray-500">
              El saldo del 50 % se facturará para esta fecha.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Locación de la sesión
          </label>
          <input
            name="location"
            defaultValue={values.location ?? ""}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            placeholder="Estudio, Jardín Botánico, Casa del cliente…"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre del proyecto (opcional)
          </label>
          <input
            name="projectName"
            defaultValue={values.projectName ?? ""}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            placeholder="Si lo dejas vacío usaremos: Nombre del cliente — Paquete"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Vencimiento de la reserva
          </label>
          <select
            name="reserveDueInDays"
            defaultValue={values.reserveDueInDays ?? "3"}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
          >
            <option value="0">Hoy mismo</option>
            <option value="3">En 3 días</option>
            <option value="7">En 1 semana</option>
            <option value="14">En 2 semanas</option>
          </select>
        </div>
      </section>

      {/* Ubicación del cliente */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Ubicación del cliente</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
          <input
            name="address"
            defaultValue={values.address ?? ""}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            placeholder="Calle y número"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
            <input
              name="city"
              defaultValue={values.city ?? "Santo Domingo"}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              placeholder="Ciudad"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">País</label>
            <input
              name="country"
              defaultValue={values.country ?? "República Dominicana"}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>
      </section>

      {/* Redes */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Redes sociales</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
              @
            </span>
            <input
              name="instagramHandle"
              defaultValue={values.instagramHandle ?? ""}
              className="w-full pl-7 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              placeholder="usuario"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sitio web</label>
          <input
            name="websiteUrl"
            type="url"
            defaultValue={values.websiteUrl ?? ""}
            aria-invalid={!!fieldErrors.websiteUrl}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
              fieldErrors.websiteUrl
                ? "border-red-400 focus:border-red-500"
                : "border-gray-200 focus:border-blue-400"
            }`}
            placeholder="https://ejemplo.com"
          />
          <FieldError errors={fieldErrors.websiteUrl} />
        </div>
      </section>

      {/* Notas */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Notas internas</h2>
        <textarea
          name="notes"
          rows={3}
          defaultValue={values.notes ?? ""}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
          placeholder="Referencias, detalles de la cliente, preferencias de estilo…"
        />
      </section>

      {/* Resumen antes de crear */}
      {selectedPackage && eventDate && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Al crear este cliente se generarán:</p>
              <ul className="list-disc ml-5 mt-1 space-y-0.5 text-xs text-emerald-800">
                <li>Proyecto ligado al paquete <strong>{selectedPackage.name}</strong></li>
                <li>
                  Factura de reserva (50 %){" "}
                  <strong>{formatCurrency(half, currency)}</strong>
                </li>
                <li>
                  Factura final (50 %){" "}
                  <strong>{formatCurrency(remainder, currency)}</strong> con fecha{" "}
                  {new Date(eventDate).toLocaleDateString("es-MX")}
                </li>
                <li>Contrato generado desde la plantilla predeterminada</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton label="Crear cliente" disabledReason={disabledReason} />
        <Link
          href="/clients"
          className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
