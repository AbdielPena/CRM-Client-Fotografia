import { z } from "zod"

/**
 * Trata strings vacíos / whitespace como `undefined` para que campos
 * opcionales NO disparen validaciones de formato (email, url, enum…) cuando
 * el usuario simplemente dejó el campo en blanco.
 */
const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

export const createClientSchema = z.object({
  name: z
    .string({ required_error: "El nombre es obligatorio" })
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100),
  email: z.preprocess(
    emptyAsUndefined,
    z.string().email("Email inválido").max(150).optional()
  ),
  phone: z.preprocess(emptyAsUndefined, z.string().max(30).optional()),
  source: z.preprocess(
    emptyAsUndefined,
    z
      .enum([
        "manual",
        "inquiry_form",
        "referral",
        "social_media",
        "website",
        "email",
        "whatsapp",
        "instagram",
        "public_link",
        "other",
      ])
      .optional()
  ),
  notes: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
  birthdate: z.preprocess(emptyAsUndefined, z.string().optional()),
  address: z.preprocess(emptyAsUndefined, z.string().max(300).optional()),
  city: z.preprocess(emptyAsUndefined, z.string().max(100).optional()),
  country: z.preprocess(emptyAsUndefined, z.string().max(100).optional()),
  instagramHandle: z.preprocess(emptyAsUndefined, z.string().max(60).optional()),
  websiteUrl: z.preprocess(
    emptyAsUndefined,
    z.string().url("URL inválida (ej. https://ejemplo.com)").optional()
  ),
})

/**
 * Schema usado por el flujo “Crear cliente” desde el CRM.
 * Incluye campos obligatorios de negocio: paquete + fecha de sesión,
 * porque al crear al cliente se crean automáticamente el proyecto,
 * las 2 facturas (50/50) y el contrato.
 */
export const createClientWithBookingSchema = createClientSchema.extend({
  packageId: z.string({ required_error: "Selecciona un paquete" }).min(1, "Selecciona un paquete"),
  eventType: z.preprocess(
    emptyAsUndefined,
    z.string().min(1, "Selecciona el tipo de sesión").max(60)
  ),
  eventDate: z
    .string({ required_error: "La fecha de la sesión es obligatoria" })
    .min(1, "La fecha de la sesión es obligatoria")
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Fecha inválida",
    })
    .refine(
      (value) => {
        const d = new Date(value)
        d.setHours(0, 0, 0, 0)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return d.getTime() >= today.getTime()
      },
      { message: "La fecha de la sesión no puede ser pasada" }
    ),
  projectName: z.preprocess(emptyAsUndefined, z.string().max(150).optional()),
  location: z.preprocess(emptyAsUndefined, z.string().max(200).optional()),
  reserveDueInDays: z.coerce.number().int().min(0).max(30).optional(),
  // Flujo de booking nuevo: crea cliente+proyecto+contrato SIN facturas.
  // La factura única se genera tras firmar el contrato.
  skipInvoices: z.boolean().optional(),
})

export const updateClientSchema = createClientSchema.partial()

export type CreateClientInput = z.infer<typeof createClientSchema>
export type CreateClientWithBookingInput = z.infer<typeof createClientWithBookingSchema>
export type UpdateClientInput = z.infer<typeof updateClientSchema>
