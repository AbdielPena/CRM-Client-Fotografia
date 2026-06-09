/**
 * Email al cliente cuando se PUBLICA una galería de SELECCIÓN.
 * Le avisa que su galería ya está lista para elegir fotos, con el enlace
 * público (`/g/<token>`). Honra el template `gallery_available` del studio si
 * lo personalizó; si no, usa un diseño de marca por defecto.
 *
 * Se dispara desde `gallery.service.ts → publishGallery` (best-effort) solo en
 * la primera publicación (draft → published).
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { enqueueEmail } from "@/server/services/email.service"
import { resolveTemplate } from "@/server/services/email-template.service"

function appUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "https://my.abbypixel.com").replace(/\/+$/, "")
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export async function onSelectionGalleryPublished(galleryId: string): Promise<void> {
  const sb = createSupabaseServiceClient()

  const { data: gRow } = await sb
    .from("galleries")
    .select("id, studio_id, client_id, project_id, name")
    .eq("id", galleryId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = gRow as any
  if (!g) return

  // Cliente: directo en la galería o vía el proyecto.
  let clientId = (g.client_id as string | null) ?? null
  if (!clientId && g.project_id) {
    const { data: proj } = await sb
      .from("projects")
      .select("client_id")
      .eq("id", g.project_id)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientId = (proj as any)?.client_id ?? null
  }
  if (!clientId) return

  const { data: clientRow } = await sb
    .from("clients")
    .select("name, email")
    .eq("id", clientId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = clientRow as any
  if (!client?.email) return

  const { data: studioRow } = await sb
    .from("studios")
    .select("name, email, primary_color")
    .eq("id", g.studio_id)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studio = studioRow as any
  const studioName = studio?.name ?? "Tu fotógrafo"
  const accent = studio?.primary_color ?? "#b08a3e"

  // Enlace público: reusar un token activo o crear uno nuevo.
  let token: string | null = null
  const { data: tokRow } = await sb
    .from("gallery_share_tokens")
    .select("token")
    .eq("gallery_id", galleryId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  token = (tokRow as { token?: string } | null)?.token ?? null
  if (!token) {
    try {
      // import dinámico para evitar ciclo con gallery.service.
      const { createGalleryShareToken } = await import("./gallery.service")
      const created = await createGalleryShareToken(g.studio_id, galleryId)
      token = created.token
    } catch (err) {
      console.error("[selection-email] createGalleryShareToken failed", err)
    }
  }
  const galleryUrl = token ? `${appUrl()}/g/${token}` : `${appUrl()}/portal/login`

  const galleryName = (g.name as string | null) ?? "tu galería"

  const defaultHtml = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;background:#faf7f2;padding:24px;color:#2a2017">
    <div style="background:white;border-radius:18px;overflow:hidden;border:1px solid #ece3d4">
      <div style="background:linear-gradient(135deg,${accent},${accent}cc);padding:28px 24px;color:white">
        <h1 style="margin:0;font-size:21px;font-weight:600">Tu galería está lista 📸</h1>
        <p style="margin:6px 0 0;opacity:.9;font-size:14px">${escapeHtml(studioName)}</p>
      </div>
      <div style="padding:28px 24px">
        <p style="margin:0 0 12px">Hola <strong>{{client_name}}</strong>,</p>
        <p style="margin:0 0 16px;line-height:1.6">
          ¡Las fotos de <strong>{{gallery_name}}</strong> ya están disponibles para que elijas tus
          favoritas! Entra a tu galería, marca las que más te gusten y envíanos tu selección.
        </p>
        <div style="text-align:center;margin:22px 0">
          <a href="{{gallery_url}}" style="display:inline-block;background:${accent};color:white;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:600;font-size:14px">
            Ver y seleccionar mis fotos →
          </a>
        </div>
        <p style="margin:0;font-size:12.5px;color:#8a7a64;text-align:center">
          Puedes ajustar tu selección hasta que la envíes.
        </p>
      </div>
      <div style="background:#faf7f2;padding:14px 24px;border-top:1px solid #ece3d4;text-align:center">
        <p style="margin:0;font-size:11.5px;color:#b0a48e">Enviado por ${escapeHtml(studioName)}</p>
      </div>
    </div>
  </div>`

  const resolved = await resolveTemplate(
    g.studio_id,
    "gallery_available",
    {
      client_name: escapeHtml(client.name ?? ""),
      gallery_name: escapeHtml(galleryName),
      gallery_url: galleryUrl,
    },
    { subject: `Tu galería está lista — ${galleryName}`, bodyHtml: defaultHtml },
  )

  await enqueueEmail({
    studioId: g.studio_id,
    toEmail: client.email,
    toName: client.name ?? undefined,
    fromEmail: studio?.email ?? null,
    fromName: resolved.fromName ?? studioName,
    replyTo: resolved.replyTo ?? studio?.email ?? null,
    subject: resolved.subject,
    bodyHtml: resolved.bodyHtml,
    templateSlug: "gallery_available",
    relatedEntityType: "gallery",
    relatedEntityId: galleryId,
  })
}
