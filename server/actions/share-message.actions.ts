"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  setSelectionWaTemplate,
  setDeliveryWaTemplate,
  setPrintWaTemplate,
  setPrintsReadyWaTemplate,
} from "@/server/services/share-message.service"

export async function updateSelectionWaMessageAction(message: string): Promise<void> {
  const ctx = await requireStudioAuth()
  await setSelectionWaTemplate(ctx.studioId, message)
  revalidatePath("/settings/whatsapp")
}

export async function updateDeliveryWaMessageAction(message: string): Promise<void> {
  const ctx = await requireStudioAuth()
  await setDeliveryWaTemplate(ctx.studioId, message)
  revalidatePath("/settings/whatsapp")
}

export async function updatePrintWaMessageAction(message: string): Promise<void> {
  const ctx = await requireStudioAuth()
  await setPrintWaTemplate(ctx.studioId, message)
  revalidatePath("/settings/whatsapp")
}

export async function updatePrintsReadyWaMessageAction(message: string): Promise<void> {
  const ctx = await requireStudioAuth()
  await setPrintsReadyWaTemplate(ctx.studioId, message)
  revalidatePath("/settings/whatsapp")
}
