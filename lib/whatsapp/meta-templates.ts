/**
 * Catálogo de plantillas de WhatsApp **Cloud API** de PixelOS.
 *
 * A diferencia de `./templates.ts` (enlaces wa.me, Fase 1), estas son las
 * plantillas que se crean y aprueban en Meta vía la Graph API (Message
 * Templates) — sin tener que meterlas a mano en el WhatsApp Manager. La
 * sincronización vive en `server/services/whatsapp/cloud-api.service.ts`
 * (syncWhatsAppTemplates).
 *
 * Reglas de Meta respetadas aquí:
 *  - `name`: minúsculas, números y guion bajo (sin acentos ni espacios).
 *  - `category`: UTILITY (transaccional) | MARKETING (promos/saludos).
 *  - El cuerpo usa variables posicionales {{1}}, {{2}}… y debe traer un `example`
 *    con un valor por variable (Meta lo exige para revisar la plantilla).
 *
 * `emailSlug` enlaza cada plantilla con su equivalente de email (TEMPLATE_CATALOG)
 * para el envío dual: cada correo de cara al cliente también dispara su WhatsApp.
 */

export type WhatsAppTemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION"

export interface WhatsAppTemplateDef {
  /** Nombre técnico en Meta (minúsculas + guion bajo). */
  name: string
  /** Etiqueta legible para la UI. */
  label: string
  category: WhatsAppTemplateCategory
  /** Código de idioma de Meta (es / es_MX / en_US…). */
  language: string
  /** Cuerpo del mensaje con variables {{1}}, {{2}}… */
  body: string
  /** Valores de ejemplo para cada variable, en orden. Requerido por Meta. */
  example: string[]
  /** Slug de la plantilla de email equivalente (envío dual). */
  emailSlug: string
}

const NAME = "María"

export const WHATSAPP_TEMPLATE_CATALOG: WhatsAppTemplateDef[] = [
  // ───────────────── UTILITY (transaccionales) ─────────────────
  {
    name: "bienvenida_cliente",
    label: "Bienvenida — nuevo cliente",
    category: "UTILITY",
    language: "es",
    body:
      "¡Hola {{1}}! 👋 Bienvenido(a) a AbbyPixel. Gracias por confiar en nosotros para capturar tus momentos especiales. En breve te enviamos los próximos pasos. ¡Felices de tenerte!",
    example: [NAME],
    emailSlug: "client_registered",
  },
  {
    name: "reserva_confirmada",
    label: "Reserva confirmada",
    category: "UTILITY",
    language: "es",
    body:
      "¡Hola {{1}}! 🎉 Tu reserva con AbbyPixel quedó confirmada. Te enviamos los detalles a tu correo. ¡Nos vemos pronto para crear algo increíble!",
    example: [NAME],
    emailSlug: "booking_confirmed",
  },
  {
    name: "recordatorio_sesion",
    label: "Recordatorio de sesión",
    category: "UTILITY",
    language: "es",
    body:
      "¡Hola {{1}}! 📸 Se acerca tu sesión con AbbyPixel. Revisa tu correo para la fecha, hora y lugar. ¡Te esperamos!",
    example: [NAME],
    emailSlug: "booking_reminder",
  },
  {
    name: "contrato_por_firmar",
    label: "Contrato por firmar",
    category: "UTILITY",
    language: "es",
    body:
      "¡Hola {{1}}! ✍️ Tienes un contrato de AbbyPixel listo para firmar. Te enviamos el enlace a tu correo. Cualquier duda, aquí estamos.",
    example: [NAME],
    emailSlug: "contract_sent",
  },
  {
    name: "factura_lista",
    label: "Factura lista",
    category: "UTILITY",
    language: "es",
    body:
      "¡Hola {{1}}! 🧾 Tu factura de AbbyPixel ya está disponible. Revisa tu correo para verla y pagar. ¡Gracias!",
    example: [NAME],
    emailSlug: "invoice_created",
  },
  {
    name: "pago_recibido",
    label: "Pago recibido",
    category: "UTILITY",
    language: "es",
    body:
      "¡Hola {{1}}! ✅ Recibimos tu pago, ¡mil gracias! Tu reserva con AbbyPixel está al día. Seguimos en contacto.",
    example: [NAME],
    emailSlug: "payment_received",
  },
  {
    name: "galeria_seleccion_lista",
    label: "Galería de selección lista",
    category: "UTILITY",
    language: "es",
    body:
      "¡Hola {{1}}! 📷 Tu galería para seleccionar fotos ya está lista. Revisa tu correo para entrar y elegir tus favoritas. ¡Disfrútala!",
    example: [NAME],
    emailSlug: "gallery_available",
  },
  {
    name: "entrega_final_lista",
    label: "Entrega final lista",
    category: "UTILITY",
    language: "es",
    body:
      "¡Hola {{1}}! 🎁 ¡Tus fotos finales ya están listas! Revisa tu correo para descargarlas. ¡Esperamos que las ames!",
    example: [NAME],
    emailSlug: "gallery_final_delivery_available",
  },

  {
    name: "cambio_hora_sesion",
    label: "Cambio de hora de sesión",
    category: "UTILITY",
    language: "es",
    body:
      "¡Hola {{1}}! 💛 La hora de tu sesión con AbbyPixel cambió. Tu nueva hora es {{2}}. Te enviamos los detalles y el motivo a tu correo. ¡Cualquier duda, escríbenos!",
    example: [NAME, "2:00 p. m."],
    emailSlug: "session_time_changed",
  },
  {
    name: "recordatorio_saldo",
    label: "Recordatorio de saldo (sesión)",
    category: "UTILITY",
    language: "es",
    body:
      "¡Hola {{1}}! 💛 Se acerca tu sesión con AbbyPixel y queda un saldo pendiente. Revisa tu correo para el monto y los detalles. ¡Gracias!",
    example: [NAME],
    emailSlug: "session_balance_reminder",
  },

  // ───────────────── MARKETING (saludos / promos / reseñas) ─────────────────
  {
    name: "cumpleanos_cliente",
    label: "Cumpleaños",
    category: "MARKETING",
    language: "es",
    body:
      "¡Feliz cumpleaños, {{1}}! 🎂🎉 De parte de toda la familia AbbyPixel, te deseamos un día lleno de alegría. ¡Gracias por ser parte de nuestra historia!",
    example: [NAME],
    emailSlug: "engagement_birthday_greeting",
  },
  {
    name: "reactivacion_cliente",
    label: "Reactivación — cliente inactivo",
    category: "MARKETING",
    language: "es",
    body:
      "¡Hola {{1}}! 💛 Te extrañamos en AbbyPixel. ¿Listo(a) para crear nuevos recuerdos? Escríbenos y agendamos tu próxima sesión.",
    example: [NAME],
    emailSlug: "engagement_reengagement",
  },
  {
    name: "solicitud_resena",
    label: "Solicitud de reseña",
    category: "MARKETING",
    language: "es",
    body:
      "¡Hola {{1}}! ⭐ Esperamos que hayas amado tus fotos. ¿Nos ayudas con una reseña? Tu opinión significa muchísimo para AbbyPixel. El enlace está en tu correo. ¡Gracias!",
    example: [NAME],
    emailSlug: "engagement_review_request",
  },
]

/** Busca la definición de plantilla por su nombre técnico. */
export function findWhatsAppTemplate(name: string): WhatsAppTemplateDef | undefined {
  return WHATSAPP_TEMPLATE_CATALOG.find((t) => t.name === name)
}

/** Mapa emailSlug → plantilla de WhatsApp (para el envío dual). */
export const WHATSAPP_BY_EMAIL_SLUG: Record<string, WhatsAppTemplateDef> =
  WHATSAPP_TEMPLATE_CATALOG.reduce(
    (acc, t) => {
      acc[t.emailSlug] = t
      return acc
    },
    {} as Record<string, WhatsAppTemplateDef>,
  )
