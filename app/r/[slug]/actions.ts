"use server"

import { z } from "zod"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { enqueueEmail } from "@/server/services/email.service"

const schema = z.object({
  studioSlug: z.string().min(1).max(80),
  name: z.string().min(2, "El nombre es requerido").max(120),
  email: z.string().email("Email inválido"),
  phone: z.string().max(40).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
})

export type RegisterResult =
  | { ok: true; clientId: string; created: boolean; studioName: string }
  | { ok: false; error: string; fields?: Record<string, string[]> }

/**
 * Registro público de cliente. Llamado desde /r/[slug].
 *
 * - Valida studio activo via RPC SQL (security definer).
 - Idempotente por email: si el cliente ya existe, no duplica.
 * - Notifica al studio in-app y por email best-effort.
 * - Envía email de bienvenida al cliente.
 */
export async function registerPublicClient(
  formData: FormData,
): Promise<RegisterResult> {
  const raw = {
    studioSlug: formData.get("studioSlug"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    notes: formData.get("notes") ?? "",
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos inválidos",
      fields: parsed.error.flatten().fieldErrors,
    }
  }

  const supabase = createSupabaseServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "public_register_client",
    {
      p_studio_slug: parsed.data.studioSlug,
      p_name: parsed.data.name,
      p_email: parsed.data.email,
      p_phone: parsed.data.phone || null,
      p_notes: parsed.data.notes || null,
    },
  )

  if (error) {
    if (error.message?.includes("STUDIO_NOT_FOUND")) {
      return { ok: false, error: "Studio no encontrado" }
    }
    if (error.message?.includes("VALIDATION_FAILED")) {
      return { ok: false, error: "Nombre y email son obligatorios" }
    }
    console.error("[registerPublicClient] rpc error", error)
    return { ok: false, error: "No se pudo procesar el registro" }
  }

  const result = data as {
    client_id: string
    studio_id: string
    studio_name: string
    created: boolean
  }

  // Email de bienvenida al cliente (best-effort — no bloquea respuesta)
  if (result.created) {
    // Cargar email del studio para usar como From + Reply-To
    const { data: studioRow } = await supabase
      .from("studios")
      .select("email")
      .eq("id", result.studio_id)
      .maybeSingle()
    const studioEmail = (studioRow as { email: string | null } | null)?.email ?? null

    void enqueueEmail({
      studioId: result.studio_id,
      toEmail: parsed.data.email,
      toName: parsed.data.name,
      fromEmail: studioEmail,
      fromName: result.studio_name,
      replyTo: studioEmail,
      subject: `Bienvenido a ${result.studio_name}`,
      bodyHtml: `
        <p>Hola ${escapeHtml(parsed.data.name)},</p>
        <p>Gracias por registrarte con <strong>${escapeHtml(result.studio_name)}</strong>.</p>
        <p>Hemos recibido tus datos. Pronto te enviaremos información sobre nuestros paquetes y próximos pasos.</p>
        <p>Si tienes alguna pregunta, simplemente responde a este email.</p>
        <p>— ${escapeHtml(result.studio_name)}</p>
      `,
      relatedEntityType: "client",
      relatedEntityId: result.client_id,
    }).catch((err) => {
      console.error("[registerPublicClient] welcome email failed", err)
    })
  }

  return {
    ok: true,
    clientId: result.client_id,
    created: result.created,
    studioName: result.studio_name,
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
