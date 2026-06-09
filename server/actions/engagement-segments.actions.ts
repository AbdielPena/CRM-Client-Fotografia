"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  sendSegmentCampaign,
  getSegmentClientIds,
} from "@/server/services/engagement-segments.service"

/** Previsualiza cuántos clientes (con email) recibirían la campaña. */
export async function previewSegmentAction(
  segmentKey: string,
): Promise<{ ok: boolean; count?: number; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  try {
    const ids = await getSegmentClientIds(session.studioId, segmentKey)
    return { ok: true, count: ids.length }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" }
  }
}

/** Envía una campaña de email a todos los clientes de un segmento. */
export async function sendSegmentCampaignAction(
  segmentKey: string,
  subject: string,
  bodyHtml: string,
): Promise<{ ok: boolean; sent?: number; total?: number; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  if (!subject.trim() || !bodyHtml.trim()) {
    return { ok: false, message: "Asunto y mensaje son obligatorios." }
  }
  try {
    const r = await sendSegmentCampaign(session.studioId, segmentKey, {
      subject: subject.trim(),
      bodyHtml,
    })
    revalidatePath("/engagement")
    return { ok: true, sent: r.sent, total: r.total }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" }
  }
}
