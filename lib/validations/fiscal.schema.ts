import { z } from "zod"

import { NCF_TYPES, type NcfType } from "@/lib/fiscal"

/**
 * Strings vacíos → undefined para campos opcionales (consistente con resto del repo).
 */
const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

// ============================================================================
// NCF Sequences
// ============================================================================

const ncfTypeSchema = z.enum(NCF_TYPES as [NcfType, ...NcfType[]])

export const createNcfSequenceSchema = z
  .object({
    type: ncfTypeSchema,
    prefix: z
      .string()
      .regex(/^[A-Z]\d{2}$/, "Prefix debe ser un letra mayúscula + 2 dígitos (ej. B02)")
      .optional(),
    rangeFrom: z.number().int().min(1, "rangeFrom debe ser >= 1").max(99999999),
    rangeTo: z.number().int().min(2).max(99999999),
    expiresAt: z.preprocess(
      emptyAsUndefined,
      z
        .string()
        .datetime({ message: "expiresAt debe ser ISO datetime" })
        .optional(),
    ),
    notes: z.preprocess(emptyAsUndefined, z.string().max(500).optional()),
  })
  .refine((d) => d.rangeTo > d.rangeFrom, {
    message: "rangeTo debe ser mayor que rangeFrom",
    path: ["rangeTo"],
  })
  .transform((d) => ({
    ...d,
    prefix: d.prefix ?? d.type, // por defecto el prefix es igual al tipo (B02 → B02)
  }))

export type CreateNcfSequenceInput = z.infer<typeof createNcfSequenceSchema>

export const updateNcfSequenceSchema = z
  .object({
    status: z.enum(["ACTIVE", "PAUSED", "EXHAUSTED"]).optional(),
    expiresAt: z.preprocess(
      emptyAsUndefined,
      z.string().datetime().nullable().optional(),
    ),
    notes: z.preprocess(emptyAsUndefined, z.string().max(500).nullable().optional()),
  })
  .strict()

export type UpdateNcfSequenceInput = z.infer<typeof updateNcfSequenceSchema>

// ============================================================================
// Tax Config
// ============================================================================

export const upsertTaxConfigSchema = z.object({
  itbisRate: z
    .number()
    .refine((v) => v === 0 || v === 16 || v === 18, {
      message: "itbisRate debe ser 0, 16 o 18 (reglamentación DGII)",
    })
    .default(18),
  isrRetention: z.preprocess(
    emptyAsUndefined,
    z.number().min(0).max(99.99).nullable().optional(),
  ),
  rnc: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .regex(/^\d{9}$|^\d{11}$/, "RNC debe ser 9 dígitos (jurídica) o 11 (natural/cédula)")
      .nullable()
      .optional(),
  ),
  businessName: z.preprocess(
    emptyAsUndefined,
    z.string().max(255).nullable().optional(),
  ),
  defaultNcfType: z.preprocess(
    emptyAsUndefined,
    ncfTypeSchema.nullable().optional(),
  ),
})

export type UpsertTaxConfigInput = z.infer<typeof upsertTaxConfigSchema>

// ============================================================================
// Issue NCF for invoice
// ============================================================================

export const issueNcfSchema = z.object({
  invoiceId: z.string().uuid("invoiceId debe ser UUID"),
  type: ncfTypeSchema.optional(), // si no se provee, usa defaultNcfType del tax_config del studio
})

export type IssueNcfInput = z.infer<typeof issueNcfSchema>
