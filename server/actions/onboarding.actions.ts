"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  markStepCompleted,
  skipStep,
} from "@/server/services/onboarding.service"

export async function markStepCompletedAction(
  stepKey: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await markStepCompleted(session.studioId, session.userId, stepKey)
    revalidatePath("/onboarding")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function skipStepAction(
  stepKey: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await skipStep(session.studioId, session.userId, stepKey)
    revalidatePath("/onboarding")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}
