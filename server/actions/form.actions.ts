"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

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

// ─── Validation schemas ─────────────────────────────────────────────────────

const uuidSchema = z.string().uuid("ID inválido")

const templateNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre es requerido")
  .max(120, "Nombre demasiado largo")

const templateDescriptionSchema = z
  .string()
  .trim()
  .max(2000, "Descripción demasiado larga")

const createFormTemplateSchema = z.object({
  name: templateNameSchema,
  description: templateDescriptionSchema
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  isDefault: z.boolean(),
})

const updateFormTemplatePatchSchema = z.object({
  name: templateNameSchema.optional(),
  description: templateDescriptionSchema
    .nullable()
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined
      if (v === null) return null
      return v.length > 0 ? v : null
    }),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
})

const setPackagesSchema = z.object({
  templateId: uuidSchema,
  packageIds: z.array(uuidSchema).max(500),
})

const sendFormSchema = z.object({
  responseId: uuidSchema,
  bookingId: uuidSchema.nullable().optional(),
})

function parseSchema(raw: FormDataEntryValue | null): FormSchema {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Schema inválido")
  }
  // Limit incoming JSON payload (HTML user-input)
  z.string().max(200_000).parse(raw)
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

  const rawIsDefault = formData.get("isDefault")
  const parseRes = createFormTemplateSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    isDefault: rawIsDefault === "true" || rawIsDefault === "on",
  })
  if (!parseRes.success) {
    const issues = parseRes.error.issues
    const nameIssue = issues.find((i) => i.path[0] === "name")
    if (nameIssue) {
      return { error: { name: [nameIssue.message] } }
    }
    return {
      error: {
        name: [issues[0]?.message ?? "Datos inválidos"],
      },
    }
  }
  const data = parseRes.data

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
    name: data.name,
    description: data.description,
    schema,
    isDefault: data.isDefault,
  })

  revalidatePath("/settings/forms")
  return { success: true, templateId: template.id }
}

export async function updateFormTemplateAction(
  templateId: string,
  formData: FormData,
) {
  const session = await requireStudioAuth()
  const validTemplateId = uuidSchema.parse(templateId)

  const raw: {
    name?: string
    description?: string | null
    isActive?: boolean
    isDefault?: boolean
  } = {}

  if (formData.has("name")) {
    raw.name = String(formData.get("name") ?? "")
  }
  if (formData.has("description")) {
    const v = String(formData.get("description") ?? "").trim()
    raw.description = v.length > 0 ? v : null
  }
  if (formData.has("isActive")) {
    raw.isActive = formData.get("isActive") === "true"
  }
  if (formData.has("isDefault")) {
    raw.isDefault = formData.get("isDefault") === "true"
  }

  const parseRes = updateFormTemplatePatchSchema.safeParse(raw)
  if (!parseRes.success) {
    const nameIssue = parseRes.error.issues.find((i) => i.path[0] === "name")
    if (nameIssue) {
      return { error: { name: [nameIssue.message] } }
    }
    return {
      error: {
        name: [parseRes.error.issues[0]?.message ?? "Datos inválidos"],
      },
    }
  }
  const patchBase = parseRes.data

  let schemaPatch: FormSchema | undefined
  if (formData.has("schema")) {
    try {
      schemaPatch = parseSchema(formData.get("schema"))
    } catch (err) {
      return {
        error: {
          schema: [err instanceof Error ? err.message : "Schema inválido"],
        },
      }
    }
  }

  await updateFormTemplate({
    studioId: session.studioId,
    actorId: session.userId,
    templateId: validTemplateId,
    ...patchBase,
    ...(schemaPatch ? { schema: schemaPatch } : {}),
  })

  revalidatePath("/settings/forms")
  revalidatePath(`/settings/forms/${validTemplateId}`)
  return { success: true }
}

export async function setFormTemplatePackagesAction(
  templateId: string,
  packageIds: string[],
) {
  const session = await requireStudioAuth()
  const data = setPackagesSchema.parse({ templateId, packageIds })

  await setPackagesLinkedToTemplate({
    studioId: session.studioId,
    actorId: session.userId,
    templateId: data.templateId,
    packageIds: data.packageIds,
  })
  revalidatePath(`/settings/forms/${data.templateId}`)
  return { success: true }
}

export async function sendFormToClientAction(
  responseId: string,
  options?: { bookingId?: string | null },
) {
  const session = await requireStudioAuth()
  const data = sendFormSchema.parse({
    responseId,
    bookingId: options?.bookingId ?? null,
  })

  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""

  try {
    await sendFormToClient({
      studioId: session.studioId,
      actorId: session.userId,
      responseId: data.responseId,
      appBaseUrl,
    })
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No pudimos enviar el formulario",
    }
  }

  if (data.bookingId) {
    revalidatePath(`/bookings/${data.bookingId}`)
  }
  return { success: true }
}

export async function deleteFormTemplateAction(templateId: string) {
  const session = await requireStudioAuth()
  const validTemplateId = uuidSchema.parse(templateId)

  await deleteFormTemplate({
    studioId: session.studioId,
    actorId: session.userId,
    templateId: validTemplateId,
  })
  revalidatePath("/settings/forms")
  return { success: true }
}
