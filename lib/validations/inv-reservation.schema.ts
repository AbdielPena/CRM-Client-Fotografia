import { z } from "zod"

const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

/**
 * Línea de una reserva: refiere a un inv_item (bulk) O a una inv_item_unit (serialized).
 * No emite stock_movements — solo "aparta" en lógica de negocio.
 */
const reservationItemLineSchema = z
  .object({
    itemId: z.string().uuid().optional(),
    itemUnitId: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(99999).default(1),
  })
  .refine((d) => d.itemId !== undefined || d.itemUnitId !== undefined, {
    message: "Cada línea debe tener itemId o itemUnitId",
    path: ["itemId"],
  })

export const createInvReservationSchema = z
  .object({
    clientId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    responsibleId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    startDate: z
      .string()
      .datetime({ message: "startDate debe ser ISO datetime" }),
    endDate: z.string().datetime({ message: "endDate debe ser ISO datetime" }),
    reason: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
    expiresAt: z.preprocess(
      emptyAsUndefined,
      z.string().datetime().optional(),
    ),
    items: z
      .array(reservationItemLineSchema)
      .min(1, "Debe haber al menos 1 item en la reserva")
      .max(50, "Máximo 50 items por reserva"),
  })
  .refine((d) => d.clientId !== undefined || d.responsibleId !== undefined, {
    message: "Debe especificar cliente o responsible interno",
    path: ["clientId"],
  })
  .refine((d) => new Date(d.endDate) > new Date(d.startDate), {
    message: "endDate debe ser posterior a startDate",
    path: ["endDate"],
  })

export type CreateInvReservationInput = z.infer<
  typeof createInvReservationSchema
>
