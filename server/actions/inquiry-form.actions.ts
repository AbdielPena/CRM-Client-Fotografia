"use server"

import { revalidatePath } from "next/cache"
import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createInquiryForm,
  updateInquiryForm,
  deleteInquiryForm,
} from "@/server/services/inquiry-form.service"
import {
  createInquiryFormSchema,
  updateInquiryFormSchema,
} from "@/lib/validations/inquiry-form.schema"

function readRaw(formData: FormData) {
  return {
    name: formData.get("name"),
    description: formData.get("description"),
    defaultCategory: formData.get("defaultCategory"),
    submitLabel: formData.get("submitLabel"),
    successMessage: formData.get("successMessage"),
    isActive: formData.get("isActive") !== "false",
    schema: formData.get("schema"),
  }
}

export async function createInquiryFormAction(formData: FormData) {
  const session = await requireStudioAuth()
  const parsed = createInquiryFormSchema.safeParse(readRaw(formData))
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  try {
    const { id } = await createInquiryForm(
      session.studioId,
      session.userId,
      parsed.data,
    )
    revalidatePath("/leads/forms")
    return { success: true as const, formId: id }
  } catch (e) {
    return {
      error: { schema: [e instanceof Error ? e.message : "No se pudo crear"] },
    }
  }
}

export async function updateInquiryFormAction(id: string, formData: FormData) {
  const session = await requireStudioAuth()
  const parsed = updateInquiryFormSchema.safeParse(readRaw(formData))
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  try {
    await updateInquiryForm(session.studioId, session.userId, id, parsed.data)
    revalidatePath("/leads/forms")
    revalidatePath(`/leads/forms/${id}`)
    return { success: true as const }
  } catch (e) {
    return {
      error: { schema: [e instanceof Error ? e.message : "No se pudo guardar"] },
    }
  }
}

export async function deleteInquiryFormAction(id: string) {
  const session = await requireStudioAuth()
  await deleteInquiryForm(session.studioId, session.userId, id)
  revalidatePath("/leads/forms")
  return { success: true as const }
}
