import { z } from "zod"

// status enum matches Postgres project_status enum (lowercase)
export const PROJECT_STATUSES = [
  "inquiry",
  "booked",
  "in_progress",
  "editing",
  "delivered",
  "archived",
  "cancelled",
] as const

export const createProjectSchema = z.object({
  clientId: z.string().min(1, "Selecciona un cliente"),
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(150),
  eventType: z.string().min(1, "Selecciona un tipo de proyecto").max(100),
  status: z.enum(PROJECT_STATUSES).default("booked"),
  eventDate: z.string().optional().or(z.literal("")),
  eventTime: z.string().optional().or(z.literal("")),
  eventEndTime: z.string().optional().or(z.literal("")),
  location: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(3000).optional().or(z.literal("")),
  packageId: z.string().optional().or(z.literal("")),
  // Categoría de servicio. Si se deja vacío, un trigger la hereda del paquete.
  serviceCategoryId: z.string().uuid().optional().or(z.literal("")).or(z.null()),
  totalAmount: z.coerce.number().min(0).optional(),
  currency: z.string().length(3).default("DOP"),
})

export const updateProjectSchema = createProjectSchema.partial().omit({ clientId: true })

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
