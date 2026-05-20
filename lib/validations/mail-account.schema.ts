import { z } from "zod"

const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

/**
 * Crear una cuenta Mailcow. El password se almacena cifrado vía Supabase Vault
 * (en MVP: passwords plaintext en columnas TEMPORALES — TODO mover a Vault).
 */
export const createMailAccountSchema = z
  .object({
    email: z.string().email("Email inválido").max(255),
    displayName: z.preprocess(emptyAsUndefined, z.string().max(255).optional()),
    // IMAP
    imapHost: z.string().min(1, "Host IMAP requerido").max(255),
    imapPort: z.coerce.number().int().min(1).max(65535).default(993),
    imapSecure: z.boolean().default(true),
    imapUsername: z.string().min(1, "Usuario IMAP requerido").max(255),
    imapPassword: z
      .string()
      .min(1, "Password IMAP requerido")
      .max(255, "Máximo 255 caracteres"),
    // SMTP
    smtpHost: z.string().min(1, "Host SMTP requerido").max(255),
    smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
    smtpSecure: z.boolean().default(true),
    smtpUsername: z.string().min(1, "Usuario SMTP requerido").max(255),
    smtpPassword: z
      .string()
      .min(1, "Password SMTP requerido")
      .max(255),
    isDefault: z.boolean().default(false),
  })
  // Si el form solo pide 1 set de credenciales (IMAP=SMTP), copiamos automáticamente
  .transform((d) => ({
    ...d,
    smtpUsername: d.smtpUsername || d.imapUsername,
    smtpPassword: d.smtpPassword || d.imapPassword,
  }))

export type CreateMailAccountInput = z.infer<typeof createMailAccountSchema>

export const updateMailAccountSchema = z
  .object({
    displayName: z.preprocess(emptyAsUndefined, z.string().max(255).nullable().optional()),
    imapHost: z.string().min(1).max(255).optional(),
    imapPort: z.coerce.number().int().min(1).max(65535).optional(),
    imapSecure: z.boolean().optional(),
    imapUsername: z.string().min(1).max(255).optional(),
    imapPassword: z.preprocess(emptyAsUndefined, z.string().min(1).max(255).optional()),
    smtpHost: z.string().min(1).max(255).optional(),
    smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
    smtpSecure: z.boolean().optional(),
    smtpUsername: z.string().min(1).max(255).optional(),
    smtpPassword: z.preprocess(emptyAsUndefined, z.string().min(1).max(255).optional()),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict()

export type UpdateMailAccountInput = z.infer<typeof updateMailAccountSchema>
