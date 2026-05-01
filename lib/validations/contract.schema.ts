import { z } from "zod"

export const createContractSchema = z.object({
  projectId: z.string().min(1, "Selecciona un proyecto"),
  clientId: z.string().min(1, "Selecciona un cliente"),
  templateId: z.string().optional().or(z.literal("")),
  title: z.string().min(2, "El título es requerido").max(200),
  body: z.string().min(10, "El contenido del contrato es requerido"),
  expiresAt: z.string().optional().or(z.literal("")),
})

export const createContractTemplateSchema = z.object({
  name: z.string().min(2).max(150),
  body: z.string().min(10),
  variables: z.array(z.string()).default([]),
})

export type CreateContractInput = z.infer<typeof createContractSchema>
export type CreateContractTemplateInput = z.infer<typeof createContractTemplateSchema>
