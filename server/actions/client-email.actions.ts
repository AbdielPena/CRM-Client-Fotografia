"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  changeClientEmail,
  previewClientEmailChange,
  type EmailChangePreview,
} from "@/server/services/client-email-change.service"

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function valida(fd: FormData): { clientId: string; email: string } | { error: string } {
  const clientId = String(fd.get("clientId") ?? "").trim()
  const email = String(fd.get("email") ?? "")
    .trim()
    .toLowerCase()
  if (!clientId) return { error: "Falta el cliente" }
  if (!RE_EMAIL.test(email)) return { error: "Ese correo no tiene un formato válido" }
  return { clientId, email }
}

/** Qué pasaría si se cambia. No escribe nada: es el paso previo obligatorio. */
export async function previewClientEmailChangeAction(
  formData: FormData,
): Promise<{ error: string } | { preview: EmailChangePreview }> {
  const session = await requireStudioAuth()
  const v = valida(formData)
  if ("error" in v) return v

  try {
    return { preview: await previewClientEmailChange(session.studioId, v.clientId, v.email) }
  } catch (e) {
    console.error("[correo-cliente] preview falló", e)
    return { error: e instanceof Error ? e.message : "No se pudo revisar el cambio" }
  }
}

/**
 * Aplica el cambio. `reenviar=true` vuelve a mandar al correo nuevo lo que ya se
 * había enviado al viejo — le escribe a la clienta, así que solo se activa
 * cuando el estudio lo marca a mano después de ver el resumen.
 */
export async function changeClientEmailAction(formData: FormData) {
  const session = await requireStudioAuth()
  const v = valida(formData)
  if ("error" in v) return v

  try {
    const r = await changeClientEmail(
      session.studioId,
      session.userId,
      v.clientId,
      v.email,
      { reenviar: formData.get("reenviar") === "true" },
    )
    revalidatePath(`/clients/${v.clientId}`)
    revalidatePath("/clients")
    return { ...r }
  } catch (e) {
    console.error("[correo-cliente] cambio falló", e)
    return { error: e instanceof Error ? e.message : "No se pudo cambiar el correo" }
  }
}
