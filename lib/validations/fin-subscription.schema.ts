import { z } from "zod"

const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

export const frecuencias = [
  "semanal",
  "quincenal",
  "mensual",
  "bimestral",
  "trimestral",
  "semestral",
  "anual",
] as const

export const createFinSubscriptionSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(200),
  monto: z
    .number()
    .positive()
    .or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number)),
  currency: z.preprocess(
    emptyAsUndefined,
    z.string().length(3).optional(),
  ),
  frecuencia: z.enum(frecuencias),
  diaCobro: z.preprocess(
    emptyAsUndefined,
    z
      .number()
      .int()
      .min(1)
      .max(31)
      .or(z.string().regex(/^\d+$/).transform(Number))
      .optional(),
  ),
  cuentaId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  tarjetaId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  categoriaId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  proximaFecha: z.string().date("proximaFecha debe ser YYYY-MM-DD"),
})

export type CreateFinSubscriptionInput = z.infer<
  typeof createFinSubscriptionSchema
>
