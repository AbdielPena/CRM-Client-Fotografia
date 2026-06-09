"use server"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  TEMPLATE_CATALOG,
  getStudioTemplate,
} from "@/server/services/email-template.service"
import { htmlToWhatsAppText } from "@/lib/whatsapp/email-to-whatsapp"

/**
 * Devuelve la versión WhatsApp (texto) del contenido de una plantilla de email
 * existente (override del estudio o default del catálogo), para que el usuario
 * la copie y cree la plantilla aprobada en Meta.
 */
export async function whatsAppVersionOfTemplateAction(slug: string) {
  const session = await requireStudioAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cat = (TEMPLATE_CATALOG as any)[slug] as
    | { label: string; defaultSubject: string; defaultBodyHtml: string }
    | undefined
  if (!cat) return { ok: false as const, error: "Plantilla no encontrada." }

  let bodyHtml = cat.defaultBodyHtml
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tpl = await getStudioTemplate(session.studioId, slug as any)
    if (tpl?.body_html) bodyHtml = tpl.body_html
  } catch {
    // usa el default del catálogo
  }

  const text = htmlToWhatsAppText(bodyHtml)
  return { ok: true as const, text, label: cat.label }
}
