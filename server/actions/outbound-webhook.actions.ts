"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createOutboundWebhook,
  deleteOutboundWebhook,
  updateOutboundWebhook,
  type WebhookEventType,
} from "@/server/services/outbound-webhook.service"

export async function createWebhookAction(
  formData: FormData,
): Promise<{ ok: boolean; secret?: string; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const name = String(formData.get("name") ?? "").trim()
  const url = String(formData.get("url") ?? "").trim()
  if (!name || !url) {
    return { ok: false, message: "Nombre y URL son requeridos" }
  }

  const eventsRaw = formData.getAll("events") as string[]
  const events = eventsRaw as WebhookEventType[]
  if (events.length === 0) {
    return { ok: false, message: "Selecciona al menos 1 evento" }
  }

  const customHeadersRaw = String(formData.get("customHeadersJson") ?? "{}")
  let customHeaders: Record<string, string> | undefined
  if (customHeadersRaw.trim() && customHeadersRaw.trim() !== "{}") {
    try {
      customHeaders = JSON.parse(customHeadersRaw) as Record<string, string>
    } catch {
      return { ok: false, message: "Custom headers debe ser JSON válido" }
    }
  }

  try {
    const result = await createOutboundWebhook(
      session.studioId,
      session.userId,
      { name, url, events, customHeaders },
    )
    revalidatePath("/settings/webhooks")
    return { ok: true, secret: result.secret }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function toggleWebhookAction(
  webhookId: string,
  isActive: boolean,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await updateOutboundWebhook(
      session.studioId,
      session.userId,
      webhookId,
      { isActive },
    )
    revalidatePath("/settings/webhooks")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function deleteWebhookAction(
  webhookId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await deleteOutboundWebhook(session.studioId, session.userId, webhookId)
    revalidatePath("/settings/webhooks")
    return { ok: true, message: "Webhook eliminado" }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}
