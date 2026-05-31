import { z } from "zod"

// Slug válido: 2-80 chars, solo minúsculas/números/guiones, sin guiones al borde
export const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/

// UUID opcional que también acepta "" (select "ninguno") y null.
// El service lo normaliza: "" / null / undefined → null (desvincular).
const optionalUuid = z
  .union([z.string().uuid("ID inválido"), z.literal(""), z.null()])
  .optional()

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
  // Plantilla de contrato y formulario que se aplican por defecto cuando un
  // cliente reserva este paquete (default_contract_template_id /
  // default_form_template_id en la tabla packages).
  contractTemplateId: optionalUuid,
  formTemplateId: optionalUuid,
})

export const updatePackageSchema = createPackageSchema.partial()

export type CreatePackageInput = z.infer<typeof createPackageSchema>
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>
