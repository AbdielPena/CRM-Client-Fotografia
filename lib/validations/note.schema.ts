import { z } from "zod"

export const createNoteSchema = z.object({
  content: z.string().min(1, "La nota no puede estar vacía").max(5000),
  entityType: z.enum(["lead", "client", "project"]),
  entityId: z.string().min(1),
})

export type CreateNoteInput = z.infer<typeof createNoteSchema>
