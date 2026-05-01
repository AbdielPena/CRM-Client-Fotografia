"use server"

import { revalidatePath } from "next/cache"
import { requireStudioAuth } from "@/server/middleware/auth"
import { createNote, deleteNote } from "@/server/services/note.service"

export async function createNoteAction(params: {
  content: string
  entityType: "lead" | "client" | "project"
  entityId: string
}) {
  const session = await requireStudioAuth()

  if (!params.content.trim()) {
    return { error: "La nota no puede estar vacía" }
  }

  await createNote(session.studioId, session.userId, params)

  const paths: Record<string, string> = {
    lead: `/leads/${params.entityId}`,
    client: `/clients/${params.entityId}`,
    project: `/projects/${params.entityId}`,
  }
  revalidatePath(paths[params.entityType])
  return { success: true }
}

export async function deleteNoteAction(noteId: string, entityType: string, entityId: string) {
  const session = await requireStudioAuth()
  await deleteNote(session.studioId, noteId)

  const paths: Record<string, string> = {
    lead: `/leads/${entityId}`,
    client: `/clients/${entityId}`,
    project: `/projects/${entityId}`,
  }
  revalidatePath(paths[entityType] ?? "/")
  return { success: true }
}
