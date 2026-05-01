"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
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
  const name = String(formData.get("name") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim() || null
  const bodyHtml = String(formData.get("bodyHtml") ?? "")
  const isDefault = formData.get("isDefault") === "true"
  const defaultValidityDays = parseValidityDays(formData.get("defaultValidityDays"))

  if (!name) return { error: { name: ["El nombre es requerido"] } }
  if (!bodyHtml.trim()) return { error: { bodyHtml: ["El cuerpo no puede estar vacío"] } }

  try {
    const tpl = await createContractTemplate({
      studioId: session.studioId,
      actorId: session.userId,
      data: { name, description, bodyHtml, isDefault, defaultValidityDays },
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

  const patch: Parameters<typeof updateContractTemplate>[0]["patch"] = {}
  if (formData.has("name")) patch.name = String(formData.get("name") ?? "")
  if (formData.has("description")) patch.description = String(formData.get("description") ?? "")
  if (formData.has("bodyHtml")) patch.bodyHtml = String(formData.get("bodyHtml") ?? "")
  if (formData.has("isDefault")) patch.isDefault = formData.get("isDefault") === "true"
  if (formData.has("isActive")) patch.isActive = formData.get("isActive") === "true"
  if (formData.has("defaultValidityDays")) {
    patch.defaultValidityDays = parseValidityDays(formData.get("defaultValidityDays"))
  }

  try {
    await updateContractTemplate({
      studioId: session.studioId,
      actorId: session.userId,
      id: templateId,
      patch,
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
