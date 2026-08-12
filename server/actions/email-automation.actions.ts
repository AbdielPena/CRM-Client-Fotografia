"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import { AUTOMATION_KEYS, automationDef, type AutomationKey } from "@/lib/email/automations"
import {
  cancelPendingEmailsForClient,
  pauseClientEmails,
  resumeClientEmails,
  updateAutomation,
} from "@/server/services/email-automation.service"

function esClave(v: unknown): v is AutomationKey {
  return typeof v === "string" && (AUTOMATION_KEYS as readonly string[]).includes(v)
}

/**
 * Lee un número del formulario. Devuelve `undefined` si viene vacío (para que
 * el servicio use el valor por defecto) y `null` si no es un número válido, que
 * el caller trata como error en vez de guardar basura.
 */
function num(fd: FormData, campo: string): number | undefined | null {
  const raw = fd.get(campo)
  if (raw == null || String(raw).trim() === "") return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null
  return n
}

export async function updateAutomationAction(formData: FormData) {
  const session = await requireStudioAuth()

  const key = formData.get("key")
  if (!esClave(key)) return { error: "Flujo desconocido" }
  const def = automationDef(key)!

  const patch: Record<string, unknown> = {
    enabled: formData.get("enabled") === "true",
  }
  for (const f of def.fields) {
    const v = num(formData, f)
    if (v === null) return { error: "Los días deben ser un número entero" }
    if (v !== undefined) patch[f] = v
  }

  const res = await updateAutomation(session.studioId, key, patch)
  if (!res.ok) return { error: res.error ?? "No se pudo guardar" }

  revalidatePath("/settings/emails/automations")
  return { success: true }
}

export async function pauseClientEmailsAction(formData: FormData) {
  const session = await requireStudioAuth()
  const clientId = String(formData.get("clientId") ?? "")
  if (!clientId) return { error: "Falta el cliente" }

  const res = await pauseClientEmails(
    session.studioId,
    clientId,
    (formData.get("reason") as string | null) ?? null,
  )
  if (!res.ok) return { error: res.error ?? "No se pudo pausar" }

  revalidatePath(`/clients/${clientId}`)
  return { success: true, cancelados: res.cancelados }
}

export async function resumeClientEmailsAction(formData: FormData) {
  const session = await requireStudioAuth()
  const clientId = String(formData.get("clientId") ?? "")
  if (!clientId) return { error: "Falta el cliente" }

  const res = await resumeClientEmails(session.studioId, clientId)
  if (!res.ok) return { error: res.error ?? "No se pudo reanudar" }

  revalidatePath(`/clients/${clientId}`)
  return { success: true }
}

/** Vaciar la cola de este cliente sin pausarlo (cortar lo que ya está en fila). */
export async function cancelClientQueuedEmailsAction(formData: FormData) {
  const session = await requireStudioAuth()
  const clientId = String(formData.get("clientId") ?? "")
  if (!clientId) return { error: "Falta el cliente" }

  const cancelados = await cancelPendingEmailsForClient(session.studioId, clientId)
  revalidatePath(`/clients/${clientId}`)
  return { success: true, cancelados }
}
