"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  applyTemplateToProject,
  createProjectTemplate,
  deleteProjectTemplate,
  updateProjectTemplate,
  type TemplateConfig,
} from "@/server/services/project-template.service"

export async function upsertTemplateAction(formData: FormData): Promise<{
  ok: boolean
  templateId?: string
  message?: string
}> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  const id = (formData.get("id") as string) || undefined
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, message: "Nombre requerido" }

  const configRaw = String(formData.get("configJson") ?? "{}")
  let config: TemplateConfig
  try {
    config = JSON.parse(configRaw) as TemplateConfig
  } catch {
    return { ok: false, message: "config JSON inválido" }
  }

  try {
    if (id) {
      await updateProjectTemplate(session.studioId, session.userId, id, {
        name,
        description: (formData.get("description") as string) || null,
        eventType: (formData.get("eventType") as string) || null,
        coverImageUrl: (formData.get("coverImageUrl") as string) || null,
        defaultDurationDays: formData.get("defaultDurationDays")
          ? Number(formData.get("defaultDurationDays"))
          : null,
        defaultCurrency: (formData.get("defaultCurrency") as string) || "DOP",
        config,
        isActive: formData.get("isActive") !== "off",
      })
      revalidatePath("/settings/project-templates")
      return { ok: true, templateId: id }
    }

    const template = await createProjectTemplate(
      session.studioId,
      session.userId,
      {
        name,
        description: (formData.get("description") as string) || undefined,
        eventType: (formData.get("eventType") as string) || undefined,
        coverImageUrl: (formData.get("coverImageUrl") as string) || undefined,
        defaultDurationDays: formData.get("defaultDurationDays")
          ? Number(formData.get("defaultDurationDays"))
          : undefined,
        defaultCurrency:
          (formData.get("defaultCurrency") as string) || undefined,
        config,
      },
    )
    revalidatePath("/settings/project-templates")
    return { ok: true, templateId: template.id }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function deleteTemplateAction(
  templateId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    await deleteProjectTemplate(
      session.studioId,
      session.userId,
      templateId,
    )
    revalidatePath("/settings/project-templates")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function applyTemplateAction(
  templateId: string,
  projectId: string,
  eventDate: string,
): Promise<{
  ok: boolean
  tasksCreated?: number
  deliverablesCreated?: number
  errors?: string[]
  message?: string
}> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    const result = await applyTemplateToProject(
      session.studioId,
      session.userId,
      templateId,
      projectId,
      eventDate,
    )
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/tasks")
    return {
      ok: true,
      tasksCreated: result.tasksCreated,
      deliverablesCreated: result.deliverablesCreated,
      errors: result.errors,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}
