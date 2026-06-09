"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createEngagementAutomation,
  toggleEngagementAutomation,
  deleteEngagementAutomation,
  runEngagementCron,
} from "@/server/services/engagement.service"
import { ENGAGEMENT_PRESETS } from "@/lib/engagement/presets"

export async function createEngagementPresetAction(
  presetKey: string,
): Promise<{ ok: boolean; id?: string; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  const preset = ENGAGEMENT_PRESETS[presetKey]
  if (!preset) return { ok: false, message: "Preset desconocido" }
  try {
    const r = await createEngagementAutomation(session.studioId, session.userId, {
      name: preset.name,
      description: preset.description,
      triggerType: preset.triggerType,
      triggerConfig: preset.triggerConfig,
      steps: preset.steps,
    })
    revalidatePath("/engagement")
    return { ok: true, id: r.id }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" }
  }
}

export async function toggleEngagementAutomationAction(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  try {
    await toggleEngagementAutomation(session.studioId, id, active)
    revalidatePath("/engagement")
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" }
  }
}

export async function deleteEngagementAutomationAction(
  id: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  try {
    await deleteEngagementAutomation(session.studioId, id)
    revalidatePath("/engagement")
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" }
  }
}

/** Corre el ciclo del Hub manualmente (para probar sin esperar al cron). */
export async function runEngagementNowAction(): Promise<{
  ok: boolean
  enrolled?: number
  steps?: number
  message?: string
}> {
  try {
    await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  try {
    const r = await runEngagementCron()
    revalidatePath("/engagement")
    return { ok: true, enrolled: r.enrolled, steps: r.steps }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" }
  }
}
