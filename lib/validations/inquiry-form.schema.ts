import { z } from "zod"

/**
 * Validación de los formularios de captación de leads (inquiry_forms).
 * El `schema` (FormSchema con los campos) llega como JSON string desde el
 * editor admin y se valida en el service con assertFormSchema().
 */
export const createInquiryFormSchema = z.object({
  name: z.string().trim().min(2, "El nombre es requerido").max(150),
  description: z.string().max(1000).optional().or(z.literal("")),
  // event_type que se asigna por defecto a los leads de este formulario
  defaultCategory: z.string().max(120).optional().or(z.literal("")),
  submitLabel: z.string().max(60).optional().or(z.literal("")),
  successMessage: z.string().max(500).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  // FormSchema serializado (JSON). Se valida la forma en el service.
  schema: z.string().min(2, "Faltan los campos del formulario"),
})

export const updateInquiryFormSchema = createInquiryFormSchema.partial()

export type CreateInquiryFormInput = z.infer<typeof createInquiryFormSchema>
export type UpdateInquiryFormInput = z.infer<typeof updateInquiryFormSchema>
