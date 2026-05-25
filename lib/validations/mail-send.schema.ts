import { z } from "zod"

const emptyAsUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined
  return value
}

const addressSchema = z.object({
  email: z.string().email("Email inválido"),
  name: z.preprocess(emptyAsUndefined, z.string().max(255).optional()),
})

/**
 * Envío de un email via SMTP. Si replyToMessageId está presente, el header
 * In-Reply-To + References se construye automáticamente para mantener el
 * threading RFC 5322 en el cliente del destinatario.
 */
export const sendMailSchema = z.object({
  accountId: z.string().uuid("accountId debe ser UUID"),
  to: z.array(addressSchema).min(1, "Al menos 1 destinatario"),
  cc: z.array(addressSchema).optional(),
  bcc: z.array(addressSchema).optional(),
  subject: z.string().min(1, "Subject requerido").max(998), // RFC 5322 line limit
  textBody: z.preprocess(emptyAsUndefined, z.string().max(1_000_000).optional()),
  htmlBody: z.preprocess(emptyAsUndefined, z.string().max(1_000_000).optional()),
  // Reply context (opcional)
  replyToMessageId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  // Cross-módulo (opcional)
  clientId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  projectId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  invoiceId: z.preprocess(emptyAsUndefined, z.string().uuid().optional()),
  // Attachments (referencia a Storage o inline base64)
  attachments: z
    .array(
      z.object({
        filename: z.string().max(255),
        // Base64 del contenido. Cap a 25MB encoded.
        contentBase64: z.string().max(33_554_432),
        contentType: z.string().max(255).optional(),
        cid: z.preprocess(emptyAsUndefined, z.string().max(255).optional()),
      }),
    )
    .optional(),
}).refine((d) => d.textBody || d.htmlBody, {
  message: "Al menos uno de textBody o htmlBody debe estar presente",
  path: ["textBody"],
})

export type SendMailInput = z.infer<typeof sendMailSchema>
