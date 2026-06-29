import { z } from "zod"

import { COLLABORATOR_TYPE_VALUES } from "@/lib/constants/collaborators"

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""))

// ── Colaborador (roster) ───────────────────────────────────────────────────
export const createCollaboratorSchema = z.object({
  name: z.string().trim().min(2, "El nombre es requerido").max(150),
  type: z
    .string()
    .refine((v) => COLLABORATOR_TYPE_VALUES.includes(v), "Tipo inválido")
    .default("otro"),
  phone: optionalText(40),
  whatsapp: optionalText(40),
  email: z
    .union([z.string().trim().email("Correo inválido"), z.literal("")])
    .optional(),
  serviceOffered: optionalText(200),
  baseRate: z.coerce.number().min(0, "La tarifa no puede ser negativa").optional(),
  notes: optionalText(2000),
  status: z.enum(["active", "inactive"]).default("active"),
})

export const updateCollaboratorSchema = createCollaboratorSchema.partial()

export type CreateCollaboratorInput = z.infer<typeof createCollaboratorSchema>
export type UpdateCollaboratorInput = z.infer<typeof updateCollaboratorSchema>

// ── Asignación a un proyecto ────────────────────────────────────────────────
export const assignCollaboratorSchema = z.object({
  collaboratorId: z.string().uuid("Colaborador inválido"),
  role: optionalText(100),
  agreedPay: z.coerce.number().min(0, "El pago no puede ser negativo").optional(),
  payStatus: z.enum(["pending", "paid", "cancelled"]).default("pending"),
  serviceDate: z.string().optional().or(z.literal("")),
  paymentMethod: optionalText(60),
  notes: optionalText(2000),
})

export const updateAssignmentSchema = assignCollaboratorSchema
  .omit({ collaboratorId: true })
  .partial()

export type AssignCollaboratorInput = z.infer<typeof assignCollaboratorSchema>
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>
