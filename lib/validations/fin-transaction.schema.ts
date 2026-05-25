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

/**
 * Crear una transacción financiera. Schema replica la API original de
 * finanzapp con nombres en español + multi-tenant via studioId del session.
 *
 * Reglas:
 *   - tipo='transferencia' DEBE tener cuenta_id (origen) Y cuenta_destino_id
 *   - tipo='ingreso' usa cuenta_id como destino (donde entra el dinero)
 *   - tipo='gasto' usa cuenta_id como origen (de donde sale el dinero)
 *   - tipo='gasto' opcionalmente tarjeta_id (gasto con tarjeta de crédito)
 */
export const createFinTransactionSchema = z
  .object({
    tipo: z.enum(["ingreso", "gasto", "transferencia"]),
    monto: moneyRequired,
    currency: z.string().min(3).max(3).default("DOP"),
    descripcion: z.preprocess(emptyAsUndefined, z.string().max(500).optional()),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD"),
    categoriaId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    cuentaId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    cuentaDestinoId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    tarjetaId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    tipoIngreso: z.preprocess(
      emptyAsUndefined,
      z.enum(["personal", "cliente", "salario", "prestamo", "otro"]).optional(),
    ),
    invoiceId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    clientId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
    externalReference: z.preprocess(emptyAsUndefined, z.string().max(150).optional()),
    aplicaDiezmo: z.boolean().default(false),
    isBusiness: z.boolean().default(true),
    notas: z.preprocess(emptyAsUndefined, z.string().max(2000).optional()),
    beneficiarios: z
      .array(
        z.object({
          beneficiaryId: z.string().uuid().optional(),
          nombre: z.string(),
          monto: moneyRequired,
        }),
      )
      .optional(),
  })
  .refine(
    (d) => d.tipo !== "transferencia" || (d.cuentaId && d.cuentaDestinoId),
    {
      message: "Transferencias requieren cuentaId (origen) y cuentaDestinoId",
      path: ["cuentaDestinoId"],
    },
  )
  .refine(
    (d) =>
      d.tipo !== "transferencia" ||
      d.cuentaId !== d.cuentaDestinoId,
    {
      message: "Cuenta origen y destino no pueden ser iguales",
      path: ["cuentaDestinoId"],
    },
  )

export type CreateFinTransactionInput = z.infer<typeof createFinTransactionSchema>

export const updateFinTransactionSchema = z
  .object({
    monto: moneyRequired.optional(),
    descripcion: z.preprocess(emptyAsUndefined, z.string().max(500).nullable().optional()),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD")
      .optional(),
    categoriaId: z.preprocess(emptyAsUndefined, z.string().uuid().nullable().optional()),
    notas: z.preprocess(emptyAsUndefined, z.string().max(2000).nullable().optional()),
    estado: z.enum(["activo", "hold", "anulado"]).optional(),
    isBusiness: z.boolean().optional(),
    aplicaDiezmo: z.boolean().optional(),
  })
  .strict()

export type UpdateFinTransactionInput = z.infer<typeof updateFinTransactionSchema>

/**
 * Schema para el wire-up automático: invoice.paid → fin_transactions.income.
 * Recibimos los datos de Stripe/CRM y los normalizamos al shape de transactions.
 */
export const recordIncomeFromInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: moneyRequired,
  currency: z.string().min(3).max(3).default("DOP"),
  paidAt: z.string().datetime().optional(),
  paymentReference: z.preprocess(emptyAsUndefined, z.string().max(150).optional()),
  /** Si la invoice ya tiene client_id (CRM), lo pasamos para enlazar. */
  clientId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
})

export type RecordIncomeFromInvoiceInput = z.infer<typeof recordIncomeFromInvoiceSchema>
