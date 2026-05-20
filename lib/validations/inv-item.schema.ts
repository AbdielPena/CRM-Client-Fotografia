import { z } from "zod"

/**
 * Trata strings vacíos como undefined para campos opcionales (consistente con
 * el patrón de client.schema.ts y resto de validations del repo).
 */
const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

/**
 * Numeric monetario: acepta string "12.34", number 12.34, o undefined.
 * Validación de rango básica. La precisión real (decimal.js) se aplica en el service.
 */
const moneyOptional = z.preprocess(
  emptyAsUndefined,
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number.parseFloat(v) : v))
    .pipe(z.number().min(0, "Debe ser mayor o igual a 0").max(99999999.99))
    .optional()
)

/**
 * Crear item del inventario. Diferencia clave:
 *  - kind='serialized' → quantity_total DEBE ser 0 (las unidades viven en inv_item_units)
 *  - kind='bulk' → quantity_total >= 0 (catálogo a granel, sin serial)
 */
export const createInvItemSchema = z
  .object({
    kind: z.enum(["serialized", "bulk"], {
      required_error: "kind es obligatorio (serialized o bulk)",
    }),
    name: z
      .string({ required_error: "El nombre es obligatorio" })
      .min(2, "El nombre debe tener al menos 2 caracteres")
      .max(255),
    categoryId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    subcategoryId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    brand: z.preprocess(emptyAsUndefined, z.string().max(100).optional()),
    model: z.preprocess(emptyAsUndefined, z.string().max(100).optional()),
    description: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
    internalCode: z.preprocess(emptyAsUndefined, z.string().max(100).optional()),
    defaultPurchasePrice: moneyOptional,
    defaultEstimatedValue: moneyOptional,
    defaultRentalPricePerDay: moneyOptional,
    provider: z.preprocess(emptyAsUndefined, z.string().max(255).optional()),
    quantityTotal: z.number().int().min(0).max(99999).default(0),
    minStock: z.number().int().min(0).max(99999).default(0),
    maxStock: z.preprocess(emptyAsUndefined, z.number().int().min(0).max(99999).optional()),
    defaultLocationId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    notes: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
  })
  .refine(
    (data) =>
      data.kind === "bulk" ||
      (data.kind === "serialized" && (data.quantityTotal ?? 0) === 0),
    {
      message:
        "Items kind=serialized deben tener quantity_total=0 — las unidades se crean en inv_item_units",
      path: ["quantityTotal"],
    }
  )

export type CreateInvItemInput = z.infer<typeof createInvItemSchema>

export const updateInvItemSchema = z
  .object({
    name: z.string().min(2).max(255).optional(),
    categoryId: z.preprocess(emptyAsUndefined, z.string().uuid().nullable().optional()),
    subcategoryId: z.preprocess(emptyAsUndefined, z.string().uuid().nullable().optional()),
    brand: z.preprocess(emptyAsUndefined, z.string().max(100).nullable().optional()),
    model: z.preprocess(emptyAsUndefined, z.string().max(100).nullable().optional()),
    description: z.preprocess(emptyAsUndefined, z.string().max(2000).nullable().optional()),
    internalCode: z.preprocess(emptyAsUndefined, z.string().max(100).nullable().optional()),
    defaultPurchasePrice: moneyOptional.transform((v) => v ?? null),
    defaultEstimatedValue: moneyOptional.transform((v) => v ?? null),
    defaultRentalPricePerDay: moneyOptional.transform((v) => v ?? null),
    provider: z.preprocess(emptyAsUndefined, z.string().max(255).nullable().optional()),
    minStock: z.number().int().min(0).max(99999).optional(),
    maxStock: z.preprocess(emptyAsUndefined, z.number().int().min(0).max(99999).nullable().optional()),
    defaultLocationId: z.preprocess(emptyAsUndefined, z.string().uuid().nullable().optional()),
    notes: z.preprocess(emptyAsUndefined, z.string().max(2000).nullable().optional()),
    isActive: z.boolean().optional(),
  })
  .strict()

export type UpdateInvItemInput = z.infer<typeof updateInvItemSchema>
