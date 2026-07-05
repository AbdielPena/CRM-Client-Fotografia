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
  // Tiempo estimado de entrega del servicio (en días). Editable por plan; no es
  // un valor fijo del sistema. Alimenta el cálculo de fechas de entrega.
  deliveryDays: z.coerce.number().int().min(0).max(365).optional(),
  // Vencimiento de la factura de SALDO (2da factura) relativo a la fecha de la
  // sesión: 0 = el día de la sesión, -1 = un día antes, +1 = un día después.
  balanceDueOffsetDays: z.coerce.number().int().min(-60).max(60).optional(),
  // El plan incluye el vestido (planes Luxury): el costo del vestido se resta
  // de la ganancia de la sesión y se registra como gasto en Finanzas.
  includesDress: z.boolean().default(false),
  // Monto de vestido incluido en el plan (ej. 17000). Si el vestido de la sesión
  // cuesta más, el excedente se factura como costo extra.
  dressIncludedAmount: z.coerce.number().min(0).optional(),
  includes: z.string().max(2000).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  // Plantilla de contrato y formulario que se aplican por defecto cuando un
  // cliente reserva este paquete (default_contract_template_id /
  // default_form_template_id en la tabla packages).
  contractTemplateId: optionalUuid,
  formTemplateId: optionalUuid,
  // Categoría de servicio (Quinceañeras, Bodas, etc.). Agrupa planes y define
  // la carpeta raíz en Google Drive. "" / null → sin categoría.
  serviceCategoryId: optionalUuid,
  // Imagen de portada del plan (URL pública del bucket). "" / null → sin portada.
  coverImageUrl: z
    .union([z.string().url("URL inválida"), z.literal(""), z.null()])
    .optional(),
})

export const updatePackageSchema = createPackageSchema.partial()

export type CreatePackageInput = z.infer<typeof createPackageSchema>
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>
