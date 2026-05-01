"use server"

import { revalidatePath } from "next/cache"
import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createFormTemplate,
  updateFormTemplate,
  deleteFormTemplate,
  setPackagesLinkedToTemplate,
  sendFormToClient,
} from "@/server/services/form.service"
import { assertFormSchema, type FormSchema } from "@/lib/forms/types"

/**
 * Server actions para administrar plantillas de formularios.
 *
 * El schema dinámico viaja como JSON serializado en el FormData (campo
 * "schema") para que podamos reusar useTransition + FormData del cliente
 * sin tener que firmar todo como un objeto plano.
 */

function parseSchema(raw: FormDataEntryValue | null): FormSchema {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Schema inválido")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("Schema no es JSON válido")
  }
  assertFormSchema(parsed)
  return parsed as FormSchema
}

export async function createFormTemplateAction(formData: FormData) {
  const session = await requireStudioAuth()

  const name = String(formData.get("name") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim() || null
  const isDefault = formData.get("isDefault") === "true"

  if (!name) {
    return { error: { name: ["El nombre es requerido"] } }
  }

  let schema: FormSchema
  try {
    schema = parseSchema(formData.get("schema"))
  } catch (err) {
    return {
      error: {
        schema: [err instanceof Error ? err.message : "Schema inválido"],
      },
    }
  }

  const template = await createFormTemplate({
    studioId: session.studioId,
    actorId: session.userId,
    name,
    description,
    schema,
    isDefault,
  })

  revalidatePath("/settings/forms")
  return { success: true, templateId: template.id }
}

export async function updateFormTemplateAction(
  templateId: string,
  formData: FormData,
) {
  const session = await requireStudioAuth()

  const patch: {
    name?: string
    description?: string | null
    schema?: FormSchema
    isActive?: boolean
    isDefault?: boolean
  } = {}

  if (formData.has("name")) {
    const name = String(formData.get("name") ?? "").trim()
    if (!name) return { error: { name: ["El nombre es requerido"] } }
    patch.name = name
  }

  if (formData.has("description")) {
    const desc = String(formData.get("description") ?? "").trim()
    patch.description = desc || null
  }

  if (formData.has("schema")) {
    try {
      patch.schema = parseSchema(formData.get("schema"))
    } catch (err) {
      return {
        error: {
          schema: [err instanceof Error ? err.message : "Schema inválido"],
        },
      }
    }
  }

  if (formData.has("isActive")) {
    patch.isActive = formData.get("isActive") === "true"
  }

  if (formData.has("isDefault")) {
    patch.isDefault = formData.get("isDefault") === "true"
  }

  await updateFormTemplate({
    studioId: session.studioId,
    actorId: session.userId,
    templateId,
    ...patch,
  })

  revalidatePath("/settings/forms")
  revalidatePath(`/settings/forms/${templateId}`)
  return { success: true }
}

export async function setFormTemplatePackagesAction(
  templateId: string,
  packageIds: string[],
) {
  const session = await requireStudioAuth()
  await setPackagesLinkedToTemplate({
    studioId: session.studioId,
    actorId: session.userId,
    templateId,
    packageIds,
  })
  revalidatePath(`/settings/forms/${templateId}`)
  return { success: true }
}

export async function sendFormToClientAction(
  responseId: string,
  options?: { bookingId?: string | null },
) {
  const session = await requireStudioAuth()

  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""

  try {
    await sendFormToClient({
      studioId: session.studioId,
      actorId: session.userId,
      responseId,
      appBaseUrl,
    })
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No pudimos enviar el formulario",
    }
  }

  if (options?.bookingId) {
    revalidatePath(`/bookings/${options.bookingId}`)
  }
  return { success: true }
}

export async function deleteFormTemplateAction(templateId: string) {
  const session = await requireStudioAuth()
  await deleteFormTemplate({
    studioId: session.studioId,
    actorId: session.userId,
    templateId,
  })
  revalidatePath("/settings/forms")
  return { success: true }
}
