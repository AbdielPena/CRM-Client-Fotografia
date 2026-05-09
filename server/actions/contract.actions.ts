"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createContract,
  sendContract,
  voidContract,
  deleteContract,
  createContractTemplate,
  updateContractTemplate,
  deleteContractTemplate,
} from "@/server/services/contract.service"
import { createContractSchema } from "@/lib/validations/contract.schema"

// Schemas para templates (HTML user-input — limitar tamaño y validar tipos)
const MAX_BODY_HTML = 200_000 // ~200KB suficiente para contratos largos

const templateBaseSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(120, "Máximo 120 caracteres"),
  description: z.string().max(500).nullable(),
  bodyHtml: z
    .string()
    .min(1, "El cuerpo no puede estar vacío")
    .max(MAX_BODY_HTML, "El contrato es demasiado largo"),
  isDefault: z.boolean(),
  defaultValidityDays: z.number().int().min(0).max(3650).nullable(),
})

const templateUpdateSchema = templateBaseSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export async function createContractAction(formData: FormData) {
  const session = await requireStudioAuth()

  const raw = {
    projectId: formData.get("projectId"),
    clientId: formData.get("clientId"),
    templateId: formData.get("templateId"),
    title: formData.get("title"),
    body: formData.get("body"),
    expiresAt: formData.get("expiresAt"),
  }

  const parsed = createContractSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  const contract = await createContract(session.studioId, session.userId, parsed.data)
  revalidatePath("/contracts")
  redirect(`/contracts/${contract.id}`)
}

export async function sendContractAction(contractId: string) {
  const session = await requireStudioAuth()
  const contract = await sendContract(session.studioId, session.userId, contractId)
  revalidatePath(`/contracts/${contractId}`)
  revalidatePath("/contracts")
  return { success: true, signingToken: contract?.signing_token }
}

export async function voidContractAction(contractId: string) {
  const session = await requireStudioAuth()
  await voidContract(session.studioId, session.userId, contractId)
  revalidatePath(`/contracts/${contractId}`)
  revalidatePath("/contracts")
  return { success: true }
}

export async function deleteContractAction(contractId: string) {
  const session = await requireStudioAuth()
  await deleteContract(session.studioId, session.userId, contractId)
  revalidatePath("/contracts")
  redirect("/contracts")
}

// ----------------------------------------------------------------------------
// Plantillas de contrato — acciones admin
// ----------------------------------------------------------------------------

function parseValidityDays(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === "") return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0 || n > 365) return null
  return Math.floor(n)
}

export async function createContractTemplateAction(formData: FormData) {
  const session = await requireStudioAuth()

  const parsed = templateBaseSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    bodyHtml: String(formData.get("bodyHtml") ?? ""),
    isDefault: formData.get("isDefault") === "true",
    defaultValidityDays: parseValidityDays(formData.get("defaultValidityDays")),
  })
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  try {
    const tpl = await createContractTemplate({
      studioId: session.studioId,
      actorId: session.userId,
      data: parsed.data,
    })
    revalidatePath("/settings/contracts")
    return { success: true, templateId: tpl.id }
  } catch (err) {
    return { error: { _: [err instanceof Error ? err.message : "Error inesperado"] } }
  }
}

export async function updateContractTemplateAction(
  templateId: string,
  formData: FormData,
) {
  const session = await requireStudioAuth()
  if (!z.string().uuid().safeParse(templateId).success) {
    return { error: { _: ["templateId inválido"] } }
  }

  // Construir solo los campos presentes en formData
  const raw: Record<string, unknown> = {}
  if (formData.has("name")) raw.name = String(formData.get("name") ?? "").trim()
  if (formData.has("description")) {
    raw.description = String(formData.get("description") ?? "").trim() || null
  }
  if (formData.has("bodyHtml")) raw.bodyHtml = String(formData.get("bodyHtml") ?? "")
  if (formData.has("isDefault")) raw.isDefault = formData.get("isDefault") === "true"
  if (formData.has("isActive")) raw.isActive = formData.get("isActive") === "true"
  if (formData.has("defaultValidityDays")) {
    raw.defaultValidityDays = parseValidityDays(formData.get("defaultValidityDays"))
  }

  const parsed = templateUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  try {
    await updateContractTemplate({
      studioId: session.studioId,
      actorId: session.userId,
      id: templateId,
      patch: parsed.data,
    })
    revalidatePath("/settings/contracts")
    revalidatePath(`/settings/contracts/${templateId}`)
    return { success: true }
  } catch (err) {
    return { error: { _: [err instanceof Error ? err.message : "Error inesperado"] } }
  }
}

export async function deleteContractTemplateAction(templateId: string) {
  const session = await requireStudioAuth()
  try {
    await deleteContractTemplate({
      studioId: session.studioId,
      actorId: session.userId,
      id: templateId,
    })
    revalidatePath("/settings/contracts")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error inesperado" }
  }
}
