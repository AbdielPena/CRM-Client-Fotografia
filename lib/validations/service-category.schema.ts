import { z } from "zod"

export const createServiceCategorySchema = z.object({
  name: z.string().min(2, "El nombre es requerido").max(80),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
    .default("#3b82f6"),
  icon: z.string().max(50).default("tag"),
  description: z.string().max(300).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).optional(),
  // Mensaje de agradecimiento que aparece en la galería de entrega para sesiones
  // de esta categoría (fallback cuando no hay dedicatoria de la madre).
  thankyouMessage: z.string().max(2000).optional().or(z.literal("")),
  // Monto de vestido incluido por defecto para los planes de esta categoría
  // (cada plan lo puede sobrescribir).
  dressIncludedAmount: z.coerce.number().min(0).optional(),
  // Días de entrega contados DESDE la selección del cliente (default 21).
  // preprocess: campo vacío ("") → undefined (no lo cuentes como 0).
  deliveryDays: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).max(120).optional(),
  ),
  // Días para entregar las IMPRESIONES, contados desde que se publica la
  // galería final (default 21). Es otro plazo, no el de la entrega digital.
  printDeliveryDays: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).max(120).optional(),
  ),
})

export const updateServiceCategorySchema = createServiceCategorySchema.partial()

export type CreateServiceCategoryInput = z.infer<typeof createServiceCategorySchema>
export type UpdateServiceCategoryInput = z.infer<typeof updateServiceCategorySchema>
