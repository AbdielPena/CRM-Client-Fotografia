import { z } from "zod"

export const createGallerySchema = z.object({
  projectId: z.string().min(1, "Selecciona un proyecto"),
  name: z.string().min(2, "El nombre es requerido").max(150),
  description: z.string().max(1000).optional().or(z.literal("")),
  visibility: z.enum(["PRIVATE", "PASSWORD", "PUBLIC"]).default("PRIVATE"),
  passwordHash: z.string().max(100).optional().or(z.literal("")),
  downloadResolution: z.enum(["WEB", "HIGH", "ORIGINAL"]).default("HIGH"),
  allowDownload: z.boolean().default(true),
  allowProofing: z.boolean().default(false),
  expiresAt: z.string().optional().or(z.literal("")),
  watermarkEnabled: z.boolean().default(false),
})

export const updateGallerySchema = createGallerySchema.partial().omit({ projectId: true })

export type CreateGalleryInput = z.infer<typeof createGallerySchema>
export type UpdateGalleryInput = z.infer<typeof updateGallerySchema>
