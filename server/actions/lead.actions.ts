"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createLead,
  updateLead,
  updateLeadStatus,
  deleteLead,
  convertLeadToClient,
} from "@/server/services/lead.service"
import { createLeadSchema, updateLeadSchema } from "@/lib/validations/lead.schema"

export async function createLeadAction(formData: FormData) {
  const session = await requireStudioAuth()

  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    source: formData.get("source"),
    eventType: formData.get("eventType"),
    eventDate: formData.get("eventDate"),
    budget: formData.get("budget"),
    currency: formData.get("currency") || "DOP",
    notes: formData.get("notes"),
  }

  const parsed = createLeadSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  const lead = await createLead(session.studioId, session.userId, parsed.data)
  revalidatePath("/leads")
  redirect(`/leads/${lead.id}`)
}

export async function updateLeadAction(leadId: string, formData: FormData) {
  const session = await requireStudioAuth()

  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    source: formData.get("source"),
    status: formData.get("status"),
    eventType: formData.get("eventType"),
    eventDate: formData.get("eventDate"),
    budget: formData.get("budget"),
    notes: formData.get("notes"),
  }

  const parsed = updateLeadSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  await updateLead(session.studioId, session.userId, leadId, parsed.data)
  revalidatePath(`/leads/${leadId}`)
  revalidatePath("/leads")
  return { success: true }
}

export async function updateLeadStatusAction(leadId: string, status: string) {
  const session = await requireStudioAuth()
  await updateLeadStatus(session.studioId, session.userId, leadId, status)
  revalidatePath("/leads")
  revalidatePath(`/leads/${leadId}`)
  return { success: true }
}

export async function deleteLeadAction(leadId: string) {
  const session = await requireStudioAuth()
  await deleteLead(session.studioId, session.userId, leadId)
  revalidatePath("/leads")
  redirect("/leads")
}

export async function convertLeadToClientAction(leadId: string) {
  const session = await requireStudioAuth()
  const client = await convertLeadToClient(session.studioId, session.userId, leadId)
  revalidatePath("/leads")
  revalidatePath("/clients")
  redirect(`/clients/${client.id}`)
}
