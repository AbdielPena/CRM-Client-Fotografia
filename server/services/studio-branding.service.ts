import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"

/**
 * Service de personalización per-studio: logo, colores, locale, custom domain,
 * email defaults, footer text, etc.
 *
 * Patrón: row 1:1 con studios. Si no existe, get-or-create returns row con
 * defaults. Cambios via updateStudioBranding tras feature gating.
 */

export type StudioBranding = {
  studio_id: string
  // Visual
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  primary_color: string
  secondary_color: string | null
  font_family: string | null
  // Locale
  currency: string
  locale: string
  timezone: string
  date_format: string | null
  // Mail
  from_name: string | null
  from_email: string | null
  reply_to_email: string | null
  email_signature_html: string | null
  // Custom domain
  custom_domain: string | null
  custom_domain_verified: boolean
  custom_domain_verified_at: string | null
  // Branding controls
  hide_studioflow_branding: boolean
  custom_footer_html: string | null
  custom_terms_url: string | null
  custom_privacy_url: string | null
  // Páginas
  portal_welcome_html: string | null
  booking_form_intro_html: string | null
  invoice_footer_text: string | null
  // Social
  website_url: string | null
  instagram_url: string | null
  facebook_url: string | null
  whatsapp_phone: string | null
  contact_email: string | null
  business_address: string | null
  // Audit
  created_at: string
  updated_at: string
}

export async function getStudioBranding(
  studioId: string,
): Promise<StudioBranding> {
  const sb = untypedService()
  const { data, error } = await sb.rpc("studio_get_or_create_branding", {
    p_studio_id: studioId,
  })
  if (error) throwServiceError("BRANDING_GET_FAILED", error, { studioId })
  if (!data) {
    throw new Error("BRANDING_INIT_FAILED")
  }
  return data as StudioBranding
}

/**
 * Read-only para client portal y galerías públicas (sin auth).
 * Devuelve solo los campos públicos (no incluye custom_domain_verified, etc.).
 */
export async function getPublicBrandingByStudioId(
  studioId: string,
): Promise<Partial<StudioBranding> | null> {
  // service_role: lectura pública (galerías /g, booking) — no depende de una RLS
  // permisiva sobre studio_branding. Scoping explícito por studio_id abajo.
  const sb = untypedService()
  const { data } = await sb
    .from("studio_branding")
    .select(
      `logo_url, logo_dark_url, favicon_url, primary_color, secondary_color,
       font_family, locale, hide_studioflow_branding, custom_footer_html,
       custom_terms_url, custom_privacy_url, portal_welcome_html,
       booking_form_intro_html, website_url, instagram_url, facebook_url,
       whatsapp_phone, contact_email, business_address`,
    )
    .eq("studio_id", studioId)
    .maybeSingle()
  return (data as Partial<StudioBranding>) ?? null
}

/**
 * Resuelve studio_id desde un custom domain. Para middleware/routing.
 */
export async function getStudioByCustomDomain(
  domain: string,
): Promise<{ studioId: string; branding: StudioBranding } | null> {
  const sb = untypedService()
  const { data } = await sb
    .from("studio_branding")
    .select("*")
    .eq("custom_domain", domain.toLowerCase())
    .eq("custom_domain_verified", true)
    .maybeSingle()
  if (!data) return null
  const branding = data as StudioBranding
  return { studioId: branding.studio_id, branding }
}

export async function updateStudioBranding(
  studioId: string,
  actorId: string,
  data: Partial<Omit<StudioBranding, "studio_id" | "created_at" | "updated_at">>,
): Promise<StudioBranding> {
  const sb = untypedService()

  // Ensure row exists
  await getStudioBranding(studioId)

  // Normalizar custom_domain a lowercase
  const patch: Record<string, unknown> = { ...data }
  if (typeof patch.custom_domain === "string") {
    const dom = patch.custom_domain.trim().toLowerCase()
    patch.custom_domain = dom === "" ? null : dom
    // Si cambia, resetear verificación
    patch.custom_domain_verified = false
    patch.custom_domain_verified_at = null
  }

  const { data: row, error } = await sb
    .from("studio_branding")
    .update(patch)
    .eq("studio_id", studioId)
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505" && error.message?.includes("custom_domain")) {
      throw new Error("BRANDING_DOMAIN_TAKEN")
    }
    throwServiceError("BRANDING_UPDATE_FAILED", error, { studioId })
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "studio_branding",
    entityId: studioId,
    action: "studio_branding.updated",
    metadata: { keys: Object.keys(patch) },
  })

  return row as StudioBranding
}

export async function verifyCustomDomain(
  studioId: string,
  actorId: string,
): Promise<{ verified: boolean; message: string }> {
  const branding = await getStudioBranding(studioId)
  if (!branding.custom_domain) {
    return { verified: false, message: "No hay custom_domain configurado" }
  }

  // V1: verificación simple via DNS TXT lookup
  // TODO V2: usar dns.promises.resolveTxt en Node + validar TXT record
  // específico como "studioflow-verification=<studio_id>"
  // Por ahora marcamos verified=true (manual) — el owner es responsable de
  // configurar el CNAME del dominio.

  const sb = untypedService()
  const { error } = await sb
    .from("studio_branding")
    .update({
      custom_domain_verified: true,
      custom_domain_verified_at: new Date().toISOString(),
    })
    .eq("studio_id", studioId)

  if (error)
    throwServiceError("BRANDING_VERIFY_FAILED", error, { studioId })

  await logActivity({
    studioId,
    actorId,
    entityType: "studio_branding",
    entityId: studioId,
    action: "studio_branding.domain_verified",
    metadata: { domain: branding.custom_domain },
  })

  return {
    verified: true,
    message: `Dominio ${branding.custom_domain} marcado como verificado. Asegúrate de configurar el CNAME apuntando a my.abbypixel.com.`,
  }
}
