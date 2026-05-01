import { z } from "zod"

// Esquema del formulario público de solicitud de booking.
// Este se valida tanto en cliente (UX) como en servidor (seguridad).

export const createBookingRequestSchema = z.object({
  // Identificación del studio/paquete (normalmente viene del path, pero
  // validamos también en el body por seguridad).
  studioSlug: z.string().min(1, "Studio requerido"),
  packageSlug: z.string().min(1, "Paquete requerido"),

  // Datos del cliente
  clientName: z
    .string()
    .trim()
    .min(2, "Ingresa tu nombre completo")
    .max(200, "Nombre demasiado largo"),
  clientEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Email inválido")
    .max(254),
  clientPhone: z
    .string()
    .trim()
    .max(30, "Teléfono demasiado largo")
    .optional()
    .or(z.literal("")),
  clientWhatsapp: z
    .string()
    .trim()
    .max(30)
    .optional()
    .or(z.literal("")),

  // Evento
  eventType: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal("")),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .refine((value) => {
      const d = new Date(value + "T00:00:00")
      if (Number.isNaN(d.getTime())) return false
      // La fecha del evento debe ser hoy o futuro
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return d >= today
    }, "La fecha debe ser hoy o posterior"),
  eventTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida")
    .optional()
    .or(z.literal("")),
  eventLocation: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("")),
  guestCount: z.coerce
    .number()
    .int()
    .min(0, "Número inválido")
    .max(10000)
    .optional(),

  additionalNotes: z
    .string()
    .trim()
    .max(2000, "Máximo 2000 caracteres")
    .optional()
    .or(z.literal("")),

  // Honeypot anti-spam — debe venir vacío si es humano
  website: z
    .string()
    .max(0, "Formulario inválido")
    .optional()
    .or(z.literal("")),

  // Consentimiento de términos
  acceptTerms: z
    .union([z.literal("on"), z.literal("true"), z.boolean()])
    .refine((v) => v === true || v === "on" || v === "true", {
      message: "Debes aceptar los términos",
    }),
})

export type CreateBookingRequestInput = z.infer<
  typeof createBookingRequestSchema
>
