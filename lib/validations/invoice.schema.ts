import { z } from "zod"

export const invoiceItemSchema = z.object({
  description: z.string().min(1, "La descripción es requerida").max(300),
  quantity: z.coerce.number().min(0.01, "La cantidad debe ser mayor a 0"),
  unitPrice: z.coerce.number().min(0, "El precio no puede ser negativo"),
  taxRate: z.coerce.number().min(0).max(100).default(0),
})

export const createInvoiceSchema = z.object({
  projectId: z.string().min(1, "Selecciona un proyecto"),
  clientId: z.string().min(1, "Selecciona un cliente"),
  dueDate: z.string().optional().or(z.literal("")),
  currency: z.string().length(3).default("USD"),
  notes: z.string().max(2000).optional().or(z.literal("")),
  footer: z.string().max(500).optional().or(z.literal("")),
  discount: z.coerce.number().min(0).max(100).default(0),
  depositPercent: z.coerce.number().min(0).max(100).default(0),
  items: z.array(invoiceItemSchema).min(1, "Agrega al menos un ítem"),
})

export const updateInvoiceSchema = createInvoiceSchema
  .partial()
  .omit({ projectId: true, clientId: true })

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>
