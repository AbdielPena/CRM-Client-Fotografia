import "server-only"

import { createId } from "@paralleldrive/cuid2"

import { getGalleryById } from "@/server/services/gallery.service"
import { untypedService } from "@/server/supabase/untyped"

export type ShareSelectionResult = {
  url: string
  clientName: string | null
  clientEmail: string | null
  clientPhone: string | null
  sentEmail: boolean
  sentWhatsapp: boolean
  /** wa.me con mensaje pre-armado (fallback manual; siempre que haya teléfono). */
  whatsappLink: string | null
  errors: string[]
}

const DEFAULT_AVAILABILITY_DAYS = 30

/**
 * Publica (si está en draft) la galería de SELECCIÓN, asegura un link público y
 * notifica al cliente por correo (plantilla `gallery_available`) y WhatsApp.
 * Pensado para dispararse desde el desktop tras subir la selección. NO toca la
 * entrega final (no marca delivery_ready_at ni enciende descargas).
 *
 * WhatsApp = "ambas": intenta la Cloud API de Meta SI está conectada; siempre
 * devuelve `whatsappLink` (wa.me) como fallback para enviar a mano.
 */
export async function shareSelectionGallery(
  studioId: string,
  galleryId: string,
  opts: { sendEmail?: boolean; sendWhatsapp?: boolean } = {},
): Promise<ShareSelectionResult> {
  const sendEmail = opts.sendEmail !== false
  const sendWhatsapp = opts.sendWhatsapp !== false
  const sb = untypedService()
  const errors: string[] = []

  const gallery = await getGalleryById(studioId, galleryId, true)
  if (!gallery) throw new Error("Galería no encontrada")
  const g = gallery as unknown as {
    id: string
    name: string
    status: string
    client_id: string | null
    expires_at: string | null
    availability_days: number | null
    package_id: string | null
  }

  // 1) Publicar si está en draft (update directo, computando expiración como la
  //    web). Columnas en snake_case porque es el cliente untyped.
  if (g.status === "draft") {
    const patch: Record<string, unknown> = { status: "published" }
    if (!g.expires_at) {
      let days = g.availability_days ?? null
      if (days == null && g.package_id) {
        const { data: pkg } = await sb
          .from("packages")
          .select("gallery_availability_days")
          .eq("id", g.package_id)
          .eq("studio_id", studioId)
          .maybeSingle()
        const d = (pkg as { gallery_availability_days: number | null } | null)
          ?.gallery_availability_days
        if (d != null) days = d
      }
      if (days == null) days = DEFAULT_AVAILABILITY_DAYS
      if (days > 0) {
        const exp = new Date()
        exp.setDate(exp.getDate() + days)
        patch.expires_at = exp.toISOString()
      }
    }
    await sb.from("galleries").update(patch).eq("id", galleryId).eq("studio_id", studioId)
  }

  // 2) Token público — reusar uno activo si existe.
  const { data: tokens } = await sb
    .from("gallery_share_tokens")
    .select("token")
    .eq("gallery_id", galleryId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const existing = (tokens as { token: string }[] | null)?.[0]?.token
  let url: string
  if (existing) {
    url = `${appUrl}/g/${existing}`
  } else {
    // Insert con service-role (untyped). NO usar createGalleryShareToken: usa el
    // cliente con RLS y desde la API (sin cookie) la inserción se deniega.
    const token = createId() + createId() // 48 chars, igual que la web
    const { error: tokErr } = await sb.from("gallery_share_tokens").insert({
      studio_id: studioId,
      gallery_id: galleryId,
      token,
      expires_at: null,
      view_mode: "full",
    })
    if (tokErr) throw tokErr
    url = `${appUrl}/g/${token}`
  }

  // 3) Cliente + estudio.
  let clientName: string | null = null
  let clientEmail: string | null = null
  let clientPhone: string | null = null
  if (g.client_id) {
    const { data: cli } = await sb
      .from("clients")
      .select("name, email, phone")
      .eq("id", g.client_id)
      .maybeSingle()
    const c = cli as { name: string | null; email: string | null; phone: string | null } | null
    clientName = c?.name ?? null
    clientEmail = c?.email ?? null
    clientPhone = c?.phone ?? null
  } else {
    errors.push("La galería no tiene cliente vinculado")
  }

  const { data: studioRow } = await sb
    .from("studios")
    .select("name")
    .eq("id", studioId)
    .maybeSingle()
  const studioName = (studioRow as { name?: string } | null)?.name ?? ""

  let sentEmail = false
  let sentWhatsapp = false

  // 4) Correo — plantilla gallery_available (cola; cron la drena).
  if (sendEmail && g.client_id) {
    if (!clientEmail) {
      errors.push("El cliente no tiene email registrado")
    } else {
      try {
        const { enqueueEmail } = await import("./email.service")
        const { resolveTemplate, TEMPLATE_CATALOG } = await import("./email-template.service")
        const defaults = TEMPLATE_CATALOG.gallery_available
        const vars = {
          client_name: clientName ?? "",
          gallery_name: g.name,
          gallery_url: url,
          studio_name: studioName,
        }
        const tpl = await resolveTemplate(studioId, "gallery_available", vars, {
          subject: defaults.defaultSubject,
          bodyHtml: defaults.defaultBodyHtml,
        })
        await enqueueEmail({
          studioId,
          toEmail: clientEmail,
          toName: clientName,
          subject: tpl.subject,
          bodyHtml: tpl.bodyHtml,
          fromName: tpl.fromName,
          replyTo: tpl.replyTo,
          templateSlug: "gallery_available",
          relatedEntityType: "gallery",
          relatedEntityId: galleryId,
        })
        sentEmail = true
      } catch (e) {
        errors.push(`Email: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  // 5) WhatsApp — wa.me siempre (fallback) + API de Meta si está conectada.
  let whatsappLink: string | null = null
  if (clientPhone) {
    const digits = clientPhone.replace(/\D/g, "")
    const { getSelectionWaTemplate } = await import("./share-message.service")
    const { renderWaMessage, firstNameOf } = await import("@/lib/share/wa-message")
    const tpl = await getSelectionWaTemplate(studioId)
    const msg = renderWaMessage(tpl, {
      cliente: firstNameOf(clientName),
      galeria: g.name,
      link: url,
    })
    whatsappLink = `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
  } else if (sendWhatsapp && g.client_id) {
    errors.push("El cliente no tiene teléfono registrado")
  }

  if (sendWhatsapp && clientPhone) {
    try {
      const { getWhatsAppStatus, sendTemplateMessage } = await import(
        "./whatsapp/cloud-api.service"
      )
      const status = await getWhatsAppStatus(studioId)
      if (status.connected) {
        // Requiere una plantilla aprobada "galeria_lista" en Meta. Si no existe o
        // falla, queda el wa.me como fallback (no es error duro).
        const r = await sendTemplateMessage(studioId, clientPhone, "galeria_lista", "es", [
          clientName ?? "amig@",
        ])
        if (r.ok) sentWhatsapp = true
      }
    } catch {
      /* fallback: wa.me */
    }
  }

  return {
    url,
    clientName,
    clientEmail,
    clientPhone,
    sentEmail,
    sentWhatsapp,
    whatsappLink,
    errors,
  }
}
