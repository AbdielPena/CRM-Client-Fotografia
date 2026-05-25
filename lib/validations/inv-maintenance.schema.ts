import { z } from "zod"

const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

export const maintenanceTypes = [
  "preventivo",
  "correctivo",
  "limpieza",
  "revision",
  "reparacion",
  "calibracion",
  "cambio_pieza",
] as const

export const createInvMaintenanceSchema = z
  .object({
    itemId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    itemUnitId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    type: z.enum(maintenanceTypes),
    description: z.preprocess(
      emptyAsUndefined,
      z.string().max(2000).optional(),
    ),
    technician: z.preprocess(emptyAsUndefined, z.string().max(200).optional()),
    estimatedCost: z.preprocess(
      emptyAsUndefined,
      z
        .number()
        .nonnegative()
        .or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number))
        .optional(),
    ),
    notes: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
    startNow: z.boolean().optional(),
  })
  .refine((d) => d.itemId !== undefined || d.itemUnitId !== undefined, {
    message: "Debe especificar item bulk o unidad serializada",
    path: ["itemId"],
  })

export type CreateInvMaintenanceInput = z.infer<
  typeof createInvMaintenanceSchema
>

export const completeInvMaintenanceSchema = z.object({
  maintenanceId: z.string().uuid(),
  finalCost: z.preprocess(
    emptyAsUndefined,
    z
      .number()
      .nonnegative()
      .or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number))
      .optional(),
  ),
  nextMaintenanceDate: z.preprocess(
    emptyAsUndefined,
    z.string().date().optional(),
  ),
  notes: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
})

export type CompleteInvMaintenanceInput = z.infer<
  typeof completeInvMaintenanceSchema
>
