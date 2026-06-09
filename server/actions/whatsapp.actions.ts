"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  saveWhatsAppConfig,
  disconnectWhatsApp,
  sendWhatsAppTest,
} from "@/server/services/whatsapp/cloud-api.service"

export async function saveWhatsAppConfigAction(formData: FormData) {
  const session = await requireStudioAuth()
  const phoneNumberId = String(formData.get("phoneNumberId") ?? "").trim()
  const accessToken = String(formData.get("accessToken") ?? "").trim()
  const businessAccountId = String(formData.get("businessAccountId") ?? "").trim()
  const defaultLang = String(formData.get("defaultLang") ?? "es").trim()

  if (!phoneNumberId) return { ok: false as const, error: "Falta el Phone Number ID." }
  if (!accessToken) return { ok: false as const, error: "Falta el Access Token." }

  try {
    await saveWhatsAppConfig(session.studioId, {
      phoneNumberId,
      accessToken,
      businessAccountId: businessAccountId || null,
      defaultLang: defaultLang || "es",
    })
    revalidatePath("/settings/whatsapp")
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Error al guardar." }
  }
}

export async function disconnectWhatsAppAction() {
  const session = await requireStudioAuth()
  try {
    await disconnectWhatsApp(session.studioId)
    revalidatePath("/settings/whatsapp")
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Error." }
  }
}

export async function sendWhatsAppTestAction(toPhone: string) {
  const session = await requireStudioAuth()
  if (!toPhone?.trim()) return { ok: false as const, error: "Escribe un número de WhatsApp." }
  const r = await sendWhatsAppTest(session.studioId, toPhone)
  if (!r.ok) return { ok: false as const, error: r.error ?? "No se pudo enviar." }
  return { ok: true as const, id: r.id }
}
