import { z } from "zod"

export const createLeadSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(200),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  source: z
    .enum([
      "manual",
      "inquiry_form",
      "referral",
      "social_media",
      "website",
      "email",
      "whatsapp",
      "instagram",
      "public_link",
      "other",
    ])
    .default("manual"),
  status: z
    .enum([
      "new",
      "contacted",
      "meeting_scheduled",
      "proposal_sent",
      "negotiating",
      "won",
      "lost",
      "archived",
    ])
    .default("new"),
  eventType: z.string().max(100).optional(),
  eventDate: z.coerce.date().optional(),
  budget: z.number().positive().optional(),
  currency: z.string().length(3).default("DOP"),
  notes: z.string().max(5000).optional(),
})

export const updateLeadSchema = createLeadSchema.partial()

export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>
