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
})

export const updateServiceCategorySchema = createServiceCategorySchema.partial()

export type CreateServiceCategoryInput = z.infer<typeof createServiceCategorySchema>
export type UpdateServiceCategoryInput = z.infer<typeof updateServiceCategorySchema>
