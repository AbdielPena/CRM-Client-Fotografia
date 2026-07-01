import { z } from "zod"

import type { FormField, FormSchema } from "./types"

/**
 * Configuración del FORMULARIO PÚBLICO de solicitud de reserva
 * (`/p/[studio]/[pkg]/book`). Es por-estudio (aplica a todos los paquetes).
 *
 * "Control total": el estudio puede ocultar / renombrar / hacer obligatorios los
 * campos fijos, cambiar los textos, y agregar sus propias preguntas.
 *
 * Los 3 campos "locked" (nombre, email, fecha) NO se pueden ocultar ni volver
 * opcionales porque son necesarios para crear la solicitud — solo su etiqueta
 * es editable.
 */

export type BookingBuiltinKey =
  | "clientName"
  | "clientEmail"
  | "clientPhone"
  | "clientWhatsapp"
  | "eventType"
  | "eventDate"
  | "eventTime"
  | "guestCount"
  | "eventLocation"
  | "additionalNotes"

export type BookingBuiltinDef = {
  key: BookingBuiltinKey
  label: string
  group: "client" | "event"
  /** Tipo de input para el render público. */
  input: "text" | "email" | "tel" | "date" | "time" | "number" | "textarea"
  /** No se puede ocultar ni volver opcional (se necesita para crear la solicitud). */
  locked?: boolean
  /** Obligatorio por defecto. */
  required?: boolean
  placeholder?: string
  hint?: string
  fullWidth?: boolean
}

/** Campos fijos, en el orden en que se muestran. */
export const BOOKING_BUILTINS: BookingBuiltinDef[] = [
  { key: "clientName", label: "Nombre completo", group: "client", input: "text", locked: true, required: true, placeholder: "Ej: María Pérez" },
  { key: "clientEmail", label: "Email", group: "client", input: "email", locked: true, required: true, placeholder: "tu@email.com" },
  { key: "clientPhone", label: "Teléfono", group: "client", input: "tel", placeholder: "(809) 000-0000" },
  { key: "clientWhatsapp", label: "WhatsApp", group: "client", input: "tel", placeholder: "(809) 000-0000", hint: "Opcional — si es diferente al teléfono" },
  { key: "eventType", label: "Tipo de evento", group: "event", input: "text" },
  { key: "eventDate", label: "Fecha del evento", group: "event", input: "date", locked: true, required: true },
  { key: "eventTime", label: "Hora de inicio", group: "event", input: "time", hint: "Opcional" },
  { key: "guestCount", label: "Invitados aprox.", group: "event", input: "number", placeholder: "150", hint: "Opcional" },
  { key: "eventLocation", label: "Ubicación", group: "event", input: "text", placeholder: "Ej: Salón Jardín Tropical, Santo Domingo", hint: "Dirección, salón o coordenadas", fullWidth: true },
  { key: "additionalNotes", label: "Notas adicionales", group: "event", input: "textarea", placeholder: "Cuéntanos detalles importantes: estilo que te gusta, personas clave, referencias, etc.", fullWidth: true },
]

export const BOOKING_BUILTIN_KEYS = BOOKING_BUILTINS.map((f) => f.key)

export type BuiltinOverride = {
  enabled?: boolean
  required?: boolean
  label?: string
}

/** Tipos de pregunta propia soportados en el formulario de reserva. */
export type BookingCustomFieldType =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "checkboxes"
  | "number"
  | "date"
  | "tel"
  | "email"

export type BookingCustomField = {
  /** id estable (se usa como name `custom_<key>`). */
  key: string
  label: string
  type: BookingCustomFieldType
  required?: boolean
  placeholder?: string
  help?: string
  /** Para select / radio / checkboxes. */
  options?: string[]
}

export type BookingFormConfig = {
  introText?: string
  consentText?: string
  submitLabel?: string
  builtins?: Partial<Record<BookingBuiltinKey, BuiltinOverride>>
  customFields?: BookingCustomField[]
}

/** Textos por defecto — replican EXACTAMENTE el formulario fijo actual. */
export const BOOKING_DEFAULTS = {
  introText:
    "Completa tus datos y revisaremos tu solicitud en las próximas 24 horas. Te contactaremos para confirmar disponibilidad y coordinar el pago de la reserva.",
  consentText:
    "Acepto que esta es una solicitud sujeta a disponibilidad. El studio me contactará para confirmar la fecha y coordinar el pago de reserva. Autorizo el uso de mis datos para gestionar esta reserva.",
  submitLabel: "Enviar solicitud",
} as const

export type ResolvedBuiltin = BookingBuiltinDef & {
  enabled: boolean
  required: boolean
  label: string
}

/** Aplica los overrides del estudio sobre los campos fijos (respeta locked). */
export function resolveBuiltins(config: BookingFormConfig | null | undefined): ResolvedBuiltin[] {
  const ov = config?.builtins ?? {}
  return BOOKING_BUILTINS.map((f) => {
    const o = ov[f.key] ?? {}
    const enabled = f.locked ? true : o.enabled !== false // default: visible
    const required = f.locked ? true : o.required ?? f.required ?? false
    const label = (o.label && o.label.trim()) || f.label
    return { ...f, enabled, required, label }
  })
}

export function bookingIntroText(config: BookingFormConfig | null | undefined): string {
  return (config?.introText && config.introText.trim()) || BOOKING_DEFAULTS.introText
}
export function bookingConsentText(config: BookingFormConfig | null | undefined): string {
  return (config?.consentText && config.consentText.trim()) || BOOKING_DEFAULTS.consentText
}
export function bookingSubmitLabel(config: BookingFormConfig | null | undefined): string {
  return (config?.submitLabel && config.submitLabel.trim()) || BOOKING_DEFAULTS.submitLabel
}

/** Nombre del campo en el FormData / metadata para una pregunta propia. */
export function customFieldName(key: string): string {
  return `custom_${key}`
}

/** Construye un FormSchema (reusa validateFormData) desde las preguntas propias. */
export function customFieldsToSchema(fields: BookingCustomField[]): FormSchema {
  const mapped: FormField[] = fields.map((f) => ({
    key: customFieldName(f.key),
    type: f.type,
    label: f.label,
    required: f.required,
    placeholder: f.placeholder,
    help: f.help,
    options: f.options?.map((o) => ({ value: o, label: o })),
  }))
  return { version: 1, fields: mapped }
}

/** Validación (server) de la config al guardar. */
export const bookingFormConfigSchema = z.object({
  introText: z.string().max(1000).optional(),
  consentText: z.string().max(1000).optional(),
  submitLabel: z.string().max(60).optional(),
  builtins: z
    .record(
      z.object({
        enabled: z.boolean().optional(),
        required: z.boolean().optional(),
        label: z.string().max(80).optional(),
      }),
    )
    .optional(),
  customFields: z
    .array(
      z.object({
        key: z
          .string()
          .min(1)
          .max(40)
          .regex(/^[a-z0-9_]+$/i, "Clave inválida"),
        label: z.string().min(1).max(120),
        type: z.enum([
          "text",
          "textarea",
          "select",
          "radio",
          "checkboxes",
          "number",
          "date",
          "tel",
          "email",
        ]),
        required: z.boolean().optional(),
        placeholder: z.string().max(200).optional(),
        help: z.string().max(300).optional(),
        options: z.array(z.string().max(120)).max(50).optional(),
      }),
    )
    .max(40)
    .optional(),
})
