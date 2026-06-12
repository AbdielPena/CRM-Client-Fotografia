"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  hasFeature,
} from "@/server/services/billing.service"
import {
  updateStudioBranding,
  verifyCustomDomain,
} from "@/server/services/studio-branding.service"

export type BrandingActionState = {
  ok?: boolean
  message?: string
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

export async function updateBrandingAction(
  _prev: BrandingActionState,
  formData: FormData,
): Promise<BrandingActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)

  // Feature gating: custom_domain + hide_studioflow_branding requieren plan
  const requestedDomain = (formData.get("custom_domain") as string) || ""
  const requestedHideBranding = formData.get("hide_studioflow_branding") === "on"

  if (requestedDomain) {
    const canCustomDomain = await hasFeature(session.studioId, "custom_domain")
    if (!canCustomDomain) {
      return {
        ok: false,
        message:
          "El custom domain requiere plan Pro o superior. Upgrade en /settings/billing.",
        values,
      }
    }
  }

  if (requestedHideBranding) {
    const canRemove = await hasFeature(session.studioId, "remove_branding")
    if (!canRemove) {
      return {
        ok: false,
        message:
          "Ocultar la marca PixelOS requiere plan Pro o superior. Upgrade en /settings/billing.",
        values,
      }
    }
  }

  try {
    await updateStudioBranding(session.studioId, session.userId, {
      logo_url: (formData.get("logo_url") as string) || null,
      logo_dark_url: (formData.get("logo_dark_url") as string) || null,
      favicon_url: (formData.get("favicon_url") as string) || null,
      client_banner_url: (formData.get("client_banner_url") as string) || null,
      primary_color:
        (formData.get("primary_color") as string) || "#7C3AED",
      secondary_color: (formData.get("secondary_color") as string) || null,
      font_family: (formData.get("font_family") as string) || null,

      currency: (formData.get("currency") as string) || "DOP",
      locale: (formData.get("locale") as string) || "es-DO",
      timezone:
        (formData.get("timezone") as string) || "America/Santo_Domingo",
      date_format: (formData.get("date_format") as string) || "DD/MM/YYYY",

      from_name: (formData.get("from_name") as string) || null,
      from_email: (formData.get("from_email") as string) || null,
      reply_to_email: (formData.get("reply_to_email") as string) || null,
      email_signature_html:
        (formData.get("email_signature_html") as string) || null,

      custom_domain: requestedDomain || null,
      hide_studioflow_branding: requestedHideBranding,
      custom_footer_html:
        (formData.get("custom_footer_html") as string) || null,
      custom_terms_url: (formData.get("custom_terms_url") as string) || null,
      custom_privacy_url:
        (formData.get("custom_privacy_url") as string) || null,

      portal_welcome_html:
        (formData.get("portal_welcome_html") as string) || null,
      booking_form_intro_html:
        (formData.get("booking_form_intro_html") as string) || null,
      invoice_footer_text:
        (formData.get("invoice_footer_text") as string) || null,

      website_url: (formData.get("website_url") as string) || null,
      instagram_url: (formData.get("instagram_url") as string) || null,
      facebook_url: (formData.get("facebook_url") as string) || null,
      whatsapp_phone: (formData.get("whatsapp_phone") as string) || null,
      contact_email: (formData.get("contact_email") as string) || null,
      business_address:
        (formData.get("business_address") as string) || null,
    })

    revalidatePath("/settings/branding")
    revalidatePath("/")
    return { ok: true, message: "Personalización guardada" }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido"
    if (msg === "BRANDING_DOMAIN_TAKEN") {
      return {
        ok: false,
        message: "Ese dominio ya está siendo usado por otro studio.",
        values,
      }
    }
    return { ok: false, message: msg, values }
  }
}

export async function verifyDomainAction(): Promise<{
  ok: boolean
  message: string
}> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    const result = await verifyCustomDomain(session.studioId, session.userId)
    revalidatePath("/settings/branding")
    return { ok: result.verified, message: result.message }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}
