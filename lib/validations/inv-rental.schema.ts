import { z } from "zod"

const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

const moneyOptional = z.preprocess(
  emptyAsUndefined,
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number.parseFloat(v) : v))
    .pipe(z.number().min(0).max(99999999.99))
    .optional(),
)

const moneyRequired = z.preprocess(
  (v) => (typeof v === "string" ? Number.parseFloat(v) : v),
  z.number().positive().max(99999999.99),
)

/**
 * Línea de un rental: bulk (itemId + quantity) o serialized (itemUnitId).
 */
const rentalItemLineSchema = z
  .object({
    itemId: z.string().uuid().optional(),
    itemUnitId: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(99999).default(1),
    pricePerDay: moneyRequired,
    notes: z.preprocess(emptyAsUndefined, z.string().max(500).optional()),
  })
  .refine((d) => d.itemId !== undefined || d.itemUnitId !== undefined, {
    message: "Cada línea requiere itemId o itemUnitId",
    path: ["itemId"],
  })

export const createInvRentalSchema = z
  .object({
    clientId: z.string().uuid("clientId debe ser UUID"),
    startDate: z.string().datetime({ message: "startDate ISO datetime" }),
    endDate: z.string().datetime({ message: "endDate ISO datetime" }),
    deposit: moneyOptional.transform((v) => v ?? 0),
    discount: moneyOptional.transform((v) => v ?? 0),
    tax: moneyOptional.transform((v) => v ?? 0),
    notes: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
    contractUrl: z.preprocess(emptyAsUndefined, z.string().url().optional()),
    signatureUrl: z.preprocess(emptyAsUndefined, z.string().url().optional()),
    projectId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    items: z
      .array(rentalItemLineSchema)
      .min(1, "Al menos 1 ítem en la renta")
      .max(50, "Máx 50 ítems por renta"),
  })
  .refine((d) => new Date(d.endDate) > new Date(d.startDate), {
    message: "endDate debe ser posterior a startDate",
    path: ["endDate"],
  })

export type CreateInvRentalInput = z.infer<typeof createInvRentalSchema>
export type CreateInvRentalLineInput = z.infer<typeof rentalItemLineSchema>

export const recordRentalPaymentSchema = z.object({
  rentalId: z.string().uuid(),
  monto: moneyRequired,
  method: z.enum(["efectivo", "tarjeta", "transferencia", "cheque", "deposito", "otro"]),
  reference: z.preprocess(emptyAsUndefined, z.string().max(100).optional()),
  paidAt: z.preprocess(emptyAsUndefined, z.string().datetime().optional()),
  notes: z.preprocess(emptyAsUndefined, z.string().max(500).optional()),
  finAccountId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
})

export type RecordRentalPaymentInput = z.infer<typeof recordRentalPaymentSchema>

const returnLineSchema = z.object({
  rentalItemId: z.string().uuid(),
  returnedQuantity: z.number().int().min(1),
  conditionIn: z.preprocess(emptyAsUndefined, z.string().max(50).optional()),
  notes: z.preprocess(emptyAsUndefined, z.string().max(500).optional()),
})

export const returnInvRentalSchema = z.object({
  rentalId: z.string().uuid(),
  actualReturnDate: z.preprocess(
    emptyAsUndefined,
    z.string().datetime().optional(),
  ),
  notes: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
  items: z.array(returnLineSchema).min(1, "Al menos 1 línea a devolver"),
})

export type ReturnInvRentalInput = z.infer<typeof returnInvRentalSchema>
