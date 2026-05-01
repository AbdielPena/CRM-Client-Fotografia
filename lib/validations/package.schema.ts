import { z } from "zod"

// Slug válido: 2-80 chars, solo minúsculas/números/guiones, sin guiones al borde
export const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/

export const createPackageSchema = z.object({
  name: z.string().min(2, "El nombre es requerido").max(150),
  slug: z
    .string()
    .regex(slugRegex, "Slug inválido: minúsculas, números y guiones")
    .optional()
    .or(z.literal("")),
  description: z.string().max(1000).optional().or(z.literal("")),
  price: z.coerce.number().min(0, "El precio no puede ser negativo"),
  currency: z.string().length(3).default("USD"),
  durationHours: z.coerce.number().min(0).optional(),
  editedPhotos: z.coerce.number().int().min(0).optional(),
  includes: z.string().max(2000).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
})

export const updatePackageSchema = createPackageSchema.partial()

export type CreatePackageInput = z.infer<typeof createPackageSchema>
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>
