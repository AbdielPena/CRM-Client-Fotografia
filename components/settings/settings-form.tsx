"use client"

import { useState, useTransition } from "react"
import { updateStudioAction } from "@/server/actions/settings.actions"
import { toast } from "sonner"
import { Building2, Mail, Phone, Globe, MapPin, DollarSign, FileText, ChevronDown } from "lucide-react"

const CURRENCIES = [
  { code: "DOP", label: "DOP — Peso dominicano" },
  { code: "USD", label: "USD — Dólar estadounidense" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "MXN", label: "MXN — Peso mexicano" },
  { code: "COP", label: "COP — Peso colombiano" },
  { code: "ARS", label: "ARS — Peso argentino" },
  { code: "CLP", label: "CLP — Peso chileno" },
  { code: "PEN", label: "PEN — Sol peruano" },
  { code: "BRL", label: "BRL — Real brasileño" },
  { code: "GBP", label: "GBP — Libra esterlina" },
]

const TIMEZONES = [
  "America/Santo_Domingo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo",
  "Europe/Madrid",
  "Europe/London",
  "UTC",
]

interface StudioData {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  logo_url?: string | null
  currency: string
  timezone?: string | null
  invoice_prefix?: string | null
  invoice_footer?: string | null
  contract_footer?: string | null
  tax_id?: string | null
  plan: string
}

export function SettingsForm({ studio }: { studio: StudioData }) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    name: studio.name,
    email: studio.email ?? "",
    phone: studio.phone ?? "",
    website: studio.website ?? "",
    address: studio.address ?? "",
    city: studio.city ?? "",
    country: studio.country ?? "",
    currency: studio.currency,
    timezone: studio.timezone ?? "America/Santo_Domingo",
    invoicePrefix: studio.invoice_prefix ?? "INV",
    invoiceFooter: studio.invoice_footer ?? "",
    contractFooter: studio.contract_footer ?? "",
    taxId: studio.tax_id ?? "",
  })

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const result = await updateStudioAction(form)
      if (result.success) toast.success("Configuración guardada")
      else toast.error("Error al guardar")
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Plan badge */}
      <div className="flex items-center gap-3 p-4 bg-violet-50 border border-violet-200 rounded-xl">
        <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
          <Building2 className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{studio.name}</p>
          <p className="text-xs text-gray-500">
            Plan{" "}
            <span className="font-medium text-violet-700 capitalize">{studio.plan.toLowerCase()}</span>
          </p>
        </div>
      </div>

      {/* Studio Identity */}
      <Section title="Identidad del estudio" icon={<Building2 className="h-4 w-4" />}>
        <Field label="Nombre del estudio *">
          <Input value={form.name} onChange={(v) => update("name", v)} placeholder="Mi Estudio" />
        </Field>
        <Field label="RFC / NIT / Tax ID">
          <Input value={form.taxId} onChange={(v) => update("taxId", v)} placeholder="RFC123456789" />
        </Field>
      </Section>

      {/* Contact */}
      <Section title="Contacto" icon={<Mail className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email de contacto">
            <Input type="email" value={form.email} onChange={(v) => update("email", v)} placeholder="hola@miestudio.com" />
          </Field>
          <Field label="Teléfono">
            <Input value={form.phone} onChange={(v) => update("phone", v)} placeholder="+52 55 1234 5678" />
          </Field>
        </div>
        <Field label="Sitio web">
          <Input value={form.website} onChange={(v) => update("website", v)} placeholder="https://miestudio.com" />
        </Field>
      </Section>

      {/* Location */}
      <Section title="Ubicación" icon={<MapPin className="h-4 w-4" />}>
        <Field label="Dirección">
          <Input value={form.address} onChange={(v) => update("address", v)} placeholder="Calle y número" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ciudad">
            <Input value={form.city} onChange={(v) => update("city", v)} placeholder="Ciudad de México" />
          </Field>
          <Field label="País">
            <Input value={form.country} onChange={(v) => update("country", v)} placeholder="México" />
          </Field>
        </div>
      </Section>

      {/* Finance */}
      <Section title="Finanzas" icon={<DollarSign className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Moneda">
            <Select value={form.currency} onChange={(v) => update("currency", v)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Prefijo de facturas">
            <Input value={form.invoicePrefix} onChange={(v) => update("invoicePrefix", v)} placeholder="INV" maxLength={10} />
          </Field>
        </div>
        <Field label="Zona horaria">
          <Select value={form.timezone} onChange={(v) => update("timezone", v)}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </Select>
        </Field>
      </Section>

      {/* Documents */}
      <Section title="Documentos" icon={<FileText className="h-4 w-4" />}>
        <Field label="Pie de página en facturas" hint="Aparece al final de cada factura generada">
          <Textarea
            value={form.invoiceFooter}
            onChange={(v) => update("invoiceFooter", v)}
            placeholder="Gracias por su confianza. Pago dentro de 15 días."
            rows={3}
          />
        </Field>
        <Field label="Pie de página en contratos" hint="Aparece al final de cada contrato">
          <Textarea
            value={form.contractFooter}
            onChange={(v) => update("contractFooter", v)}
            placeholder="Este contrato es válido con firma digital."
            rows={3}
          />
        </Field>
      </Section>

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 bg-gray-50">
        <span className="text-gray-500">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  maxLength?: number
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors"
    />
  )
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors resize-none"
    />
  )
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors pr-8"
      >
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
    </div>
  )
}
