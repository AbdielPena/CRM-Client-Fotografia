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
    .pipe(z.number().min(-99999999.99).max(99999999.99))
    .optional(),
)

export const accountTypeEnum = z.enum([
  "ahorro",
  "corriente",
  "nomina",
  "efectivo",
  "digital",
  "otro",
])

export const createFinAccountSchema = z.object({
  bancoId: z.string().uuid("bancoId debe ser UUID"),
  nombre: z
    .string({ required_error: "El nombre es obligatorio" })
    .min(2, "Mínimo 2 caracteres")
    .max(100),
  tipo: z.preprocess(emptyAsUndefined, accountTypeEnum.optional()),
  saldoInicial: moneyOptional.transform((v) => v ?? 0),
  currency: z.string().min(3).max(3).default("DOP"),
  activa: z.boolean().default(true),
})

export type CreateFinAccountInput = z.infer<typeof createFinAccountSchema>

export const updateFinAccountSchema = z
  .object({
    nombre: z.string().min(2).max(100).optional(),
    bancoId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    tipo: z.preprocess(emptyAsUndefined, accountTypeEnum.nullable().optional()),
    saldoInicial: moneyOptional,
    currency: z.string().min(3).max(3).optional(),
    activa: z.boolean().optional(),
  })
  .strict()

export type UpdateFinAccountInput = z.infer<typeof updateFinAccountSchema>

export const createFinBankSchema = z.object({
  nombre: z
    .string({ required_error: "El nombre del banco es obligatorio" })
    .min(2)
    .max(100),
  color: z.preprocess(
    emptyAsUndefined,
    z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color debe ser hex #RRGGBB").optional(),
  ),
  icono: z.preprocess(emptyAsUndefined, z.string().max(10).optional()),
})

export type CreateFinBankInput = z.infer<typeof createFinBankSchema>
