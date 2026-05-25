import { z } from "zod"

const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

const moneyRequired = z.preprocess(
  (v) => (typeof v === "string" ? Number.parseFloat(v) : v),
  z.number().positive("Monto debe ser mayor a 0").max(99999999.99),
)

export const createFinReceivableSchema = z.object({
  clientId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  cliente: z
    .string({ required_error: "El nombre del cliente es obligatorio" })
    .min(2)
    .max(255),
  invoiceId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  monto: moneyRequired,
  currency: z.string().min(3).max(3).default("DOP"),
  fechaEmision: z.preprocess(
    emptyAsUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD").optional(),
  ),
  fechaVenc: z.preprocess(
    emptyAsUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD").optional(),
  ),
  notas: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
})

export type CreateFinReceivableInput = z.infer<typeof createFinReceivableSchema>

export const recordReceivablePaymentSchema = z.object({
  receivableId: z.string().uuid(),
  monto: moneyRequired,
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  cuentaId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  notas: z.preprocess(emptyAsUndefined, z.string().max(500).optional()),
})

export type RecordReceivablePaymentInput = z.infer<typeof recordReceivablePaymentSchema>
