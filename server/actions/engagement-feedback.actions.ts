"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import { setReviewConfig } from "@/server/services/engagement-feedback.service"

export async function saveReviewConfigAction(
  googleUrl: string,
  facebookUrl: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  try {
    await setReviewConfig(session.studioId, {
      googleUrl: googleUrl.trim() || null,
      facebookUrl: facebookUrl.trim() || null,
    })
    revalidatePath("/engagement")
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" }
  }
}
