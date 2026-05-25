import { z } from "zod"

const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

export const createInvItemUnitSchema = z.object({
  itemId: z.string().uuid("itemId debe ser UUID"),
  serialNumber: z.preprocess(
    emptyAsUndefined,
    z.string().max(120).optional(),
  ),
  internalCode: z.preprocess(
    emptyAsUndefined,
    z.string().max(80).optional(),
  ),
  qrCode: z.preprocess(emptyAsUndefined, z.string().max(200).optional()),
  barcode: z.preprocess(emptyAsUndefined, z.string().max(200).optional()),
  physicalCondition: z.preprocess(
    emptyAsUndefined,
    z.string().max(120).optional(),
  ),
  operationalCondition: z.preprocess(
    emptyAsUndefined,
    z.string().max(120).optional(),
  ),
  currentLocationId: z.preprocess(
    emptyAsUndefined,
    z.string().uuid().optional(),
  ),
  purchaseDate: z.preprocess(emptyAsUndefined, z.string().date().optional()),
  purchasePrice: z.preprocess(
    emptyAsUndefined,
    z
      .number()
      .nonnegative()
      .or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number))
      .optional(),
  ),
  estimatedValue: z.preprocess(
    emptyAsUndefined,
    z
      .number()
      .nonnegative()
      .or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number))
      .optional(),
  ),
  warrantyExpiry: z.preprocess(
    emptyAsUndefined,
    z.string().date().optional(),
  ),
  provider: z.preprocess(emptyAsUndefined, z.string().max(200).optional()),
  notes: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
})

export type CreateInvItemUnitInput = z.infer<typeof createInvItemUnitSchema>

export const reportUnitLossSchema = z.object({
  unitId: z.string().uuid(),
  kind: z.enum(["perdida", "dano"]),
  reason: z.string().min(5, "La razón debe tener al menos 5 caracteres").max(500),
})

export type ReportUnitLossInput = z.infer<typeof reportUnitLossSchema>
