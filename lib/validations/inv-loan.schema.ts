import { z } from "zod"

const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

/**
 * Línea de un loan: refiere a un inv_item (bulk) O a una inv_item_unit (serialized).
 * Si itemUnitId está presente, el unit se marca como prestado.
 * Si solo itemId, se decrementa contador bulk del item.
 */
const loanItemLineSchema = z
  .object({
    itemId: z.string().uuid().optional(),
    itemUnitId: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(99999).default(1),
    conditionOut: z.preprocess(emptyAsUndefined, z.string().max(50).optional()),
    notes: z.preprocess(emptyAsUndefined, z.string().max(500).optional()),
  })
  .refine((d) => d.itemId !== undefined || d.itemUnitId !== undefined, {
    message: "Cada línea debe tener itemId o itemUnitId",
    path: ["itemId"],
  })

export const createInvLoanSchema = z.object({
  responsibleId: z.string().uuid("responsibleId debe ser UUID"),
  startDate: z.string().datetime({ message: "startDate debe ser ISO datetime" }),
  expectedReturnDate: z.string().datetime({ message: "expectedReturnDate debe ser ISO datetime" }),
  notes: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
  signatureUrl: z.preprocess(emptyAsUndefined, z.string().url().optional()),
  bookingId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  projectId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  items: z
    .array(loanItemLineSchema)
    .min(1, "Debe haber al menos 1 item en el préstamo")
    .max(50, "Máximo 50 items por préstamo"),
}).refine(
  (d) => new Date(d.expectedReturnDate) > new Date(d.startDate),
  {
    message: "expectedReturnDate debe ser posterior a startDate",
    path: ["expectedReturnDate"],
  },
)

export type CreateInvLoanInput = z.infer<typeof createInvLoanSchema>
export type CreateInvLoanItemInput = z.infer<typeof loanItemLineSchema>

/**
 * Return: marcar items devueltos. Permite return parcial (returnedQuantity
 * por línea, hasta `quantity` original).
 */
const returnLineSchema = z.object({
  loanItemId: z.string().uuid(),
  returnedQuantity: z.number().int().min(1),
  conditionIn: z.preprocess(emptyAsUndefined, z.string().max(50).optional()),
  notes: z.preprocess(emptyAsUndefined, z.string().max(500).optional()),
})

export const returnInvLoanSchema = z.object({
  loanId: z.string().uuid(),
  actualReturnDate: z.preprocess(
    emptyAsUndefined,
    z.string().datetime().optional(),
  ),
  notes: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
  items: z.array(returnLineSchema).min(1, "Debe haber al menos 1 línea a devolver"),
})

export type ReturnInvLoanInput = z.infer<typeof returnInvLoanSchema>
