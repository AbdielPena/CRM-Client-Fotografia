"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createNote, deleteNote } from "@/server/services/note.service"

// ─── Validation schemas ─────────────────────────────────────────────────────

const uuidSchema = z.string().uuid("ID inválido")

const entityTypeSchema = z.enum(["lead", "client", "project"])

const createNoteSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "La nota no puede estar vacía")
    .max(10_000, "Nota demasiado larga"),
  entityType: entityTypeSchema,
  entityId: uuidSchema,
})

const deleteNoteSchema = z.object({
  noteId: uuidSchema,
  entityType: z.string().max(40),
  entityId: z.string().max(120),
})

export async function createNoteAction(params: {
  content: string
  entityType: "lead" | "client" | "project"
  entityId: string
}) {
  const session = await requireStudioAuth()

  const parseRes = createNoteSchema.safeParse(params)
  if (!parseRes.success) {
    const first = parseRes.error.issues[0]
    return { error: first?.message ?? "La nota no puede estar vacía" }
  }
  const data = parseRes.data

  await createNote(session.studioId, session.userId, data)

  const paths: Record<typeof data.entityType, string> = {
    lead: `/leads/${data.entityId}`,
    client: `/clients/${data.entityId}`,
    project: `/projects/${data.entityId}`,
  }
  revalidatePath(paths[data.entityType])
  return { success: true }
}

export async function deleteNoteAction(noteId: string, entityType: string, entityId: string) {
  const session = await requireStudioAuth()
  const data = deleteNoteSchema.parse({ noteId, entityType, entityId })

  await deleteNote(session.studioId, data.noteId)

  const paths: Record<string, string> = {
    lead: `/leads/${data.entityId}`,
    client: `/clients/${data.entityId}`,
    project: `/projects/${data.entityId}`,
  }
  revalidatePath(paths[data.entityType] ?? "/")
  return { success: true }
}
