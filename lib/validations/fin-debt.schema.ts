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

const moneyOptional = z.preprocess(
  emptyAsUndefined,
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number.parseFloat(v) : v))
    .pipe(z.number().min(0).max(99999999.99))
    .optional(),
)

export const createFinDebtSchema = z.object({
  acreedor: z
    .string({ required_error: "El nombre del acreedor es obligatorio" })
    .min(2)
    .max(255),
  montoOriginal: moneyRequired,
  cuotasTotal: z.preprocess(
    emptyAsUndefined,
    z.number().int().positive().max(999).optional(),
  ),
  montoCuota: moneyOptional,
  tasaInteres: z.preprocess(
    emptyAsUndefined,
    z.number().min(0).max(99.99).optional(),
  ),
  currency: z.string().min(3).max(3).default("DOP"),
  fechaInicio: z.preprocess(
    emptyAsUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD").optional(),
  ),
  fechaProximoPago: z.preprocess(
    emptyAsUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD").optional(),
  ),
})

export type CreateFinDebtInput = z.infer<typeof createFinDebtSchema>

export const recordDebtPaymentSchema = z.object({
  debtId: z.string().uuid(),
  monto: moneyRequired,
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cuentaId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  notas: z.preprocess(emptyAsUndefined, z.string().max(500).optional()),
})

export type RecordDebtPaymentInput = z.infer<typeof recordDebtPaymentSchema>
