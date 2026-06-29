"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import { setSelectionWaTemplate } from "@/server/services/share-message.service"

export async function updateSelectionWaMessageAction(message: string): Promise<void> {
  const ctx = await requireStudioAuth()
  await setSelectionWaTemplate(ctx.studioId, message)
  revalidatePath("/settings/whatsapp")
}
