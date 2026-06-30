"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createProject,
  updateProject,
  deleteProject,
} from "@/server/services/project.service"
import {
  createProjectSchema,
  updateProjectSchema,
} from "@/lib/validations/project.schema"

export async function createProjectAction(formData: FormData) {
  const session = await requireStudioAuth()

  const raw = {
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    eventType: formData.get("eventType") ?? formData.get("type"),
    status: formData.get("status") || "booked",
    eventDate: formData.get("eventDate"),
    location: formData.get("location"),
    notes: formData.get("notes"),
    packageId: formData.get("packageId"),
    serviceCategoryId: formData.get("serviceCategoryId"),
    totalAmount: formData.get("totalAmount"),
    currency: formData.get("currency") || "DOP",
  }

  const parsed = createProjectSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  const project = await createProject(session.studioId, session.userId, parsed.data)
  revalidatePath("/projects")
  redirect(`/projects/${project.id}`)
}

/**
 * Cambia MANUALMENTE la hora de una sesión, con motivo → actualiza Google
 * Calendar y avisa al cliente por correo + WhatsApp.
 */
export async function changeSessionTimeAction(
  projectId: string,
  newTime: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; emailed?: boolean; whatsappApi?: boolean }> {
  const session = await requireStudioAuth()
  try {
    const { changeSessionTime } = await import(
      "@/server/services/session-schedule.service"
    )
    const res = await changeSessionTime(
      session.studioId,
      session.userId,
      projectId,
      newTime,
      reason,
    )
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/projects")
    return { ok: res.ok, emailed: res.emailed, whatsappApi: res.whatsappApi }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

export async function updateProjectAction(projectId: string, formData: FormData) {
  const session = await requireStudioAuth()

  const raw = {
    name: formData.get("name"),
    eventType: formData.get("eventType") ?? formData.get("type"),
    status: formData.get("status"),
    eventDate: formData.get("eventDate"),
    location: formData.get("location"),
    notes: formData.get("notes"),
    packageId: formData.get("packageId"),
    serviceCategoryId: formData.get("serviceCategoryId"),
    totalAmount: formData.get("totalAmount"),
  }

  const parsed = updateProjectSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  await updateProject(session.studioId, session.userId, projectId, parsed.data)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/projects")
  return { success: true }
}

export async function deleteProjectAction(projectId: string) {
  const session = await requireStudioAuth()
  await deleteProject(session.studioId, session.userId, projectId)
  revalidatePath("/projects")
  redirect("/projects")
}
