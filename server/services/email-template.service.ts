/**
 * Plantillas de email editables por el studio.
 *
 * Cada email automático del sistema tiene un `slug` único. Cuando el sistema
 * va a enviar un email, busca primero el template del studio en DB:
 *   - Si existe y is_active → usa subject/body del studio
 *   - Si no → usa el fallback hardcoded en código
 *
 * Variables soportadas en subject y body: {{var_name}} y {{var_name|fallback}}.
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"

export type TemplateSlug =
  // Cliente
  | "client_registered"
  | "client_portal_access"
  // Reservas
  | "booking_confirmed"
  | "booking_reminder"
  | "booking_cancelled"
  | "booking_rescheduled"
  // Contratos
  | "contract_sent"
  | "contract_viewed_studio"
  | "contract_signed_client_studio"
  | "contract_signed_studio_client"
  | "contract_completed_copy"
  // Facturas / pagos
  | "invoice_created"
  | "payment_received"
  | "payment_pending"
  // Galería
  | "gallery_available"
  | "gallery_selection_pending"
  | "gallery_selection_received"
  | "gallery_expiring"
  | "gallery_expired"
  | "gallery_final_delivery_available"
  | "gallery_drive_link_available"
  // Entregas
  | "delivery_ready"
  // Otros
  | "prints_ready"
  // Client Engagement Hub
  | "engagement_birthday_soon"
  | "engagement_birthday_greeting"
  | "engagement_post_delivery"
  | "engagement_reengagement"
  | "engagement_review_request"
  | "engagement_generic"

export type TemplateVariable = {
  key: string
  label: string
  example: string
}

/** Catálogo central de plantillas + variables disponibles para cada una. */
export const TEMPLATE_CATALOG: Record<
  TemplateSlug,
  {
    label: string
    description: string
    category: "client" | "booking" | "contract" | "invoice" | "gallery" | "delivery" | "engagement"
    defaultSubject: string
    defaultBodyHtml: string
    variables: TemplateVariable[]
  }
> = {
  client_registered: {
    label: "Bienvenida — cliente registrado",
    description: "Se envía cuando un nuevo cliente es agregado al sistema.",
    category: "client",
    defaultSubject: "Bienvenido a {{studio_name}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Te damos la bienvenida a {{studio_name}}. Pronto te enviaremos próximos pasos.</p><p>— {{studio_name}}</p>`,
    variables: [
      { key: "client_name", label: "Nombre del cliente", example: "Juan Pérez" },
      { key: "studio_name", label: "Nombre del estudio", example: "Abby Pixel" },
    ],
  },
  client_portal_access: {
    label: "Código de acceso al portal",
    description: "Email con el código privado para entrar al portal del cliente.",
    category: "client",
    defaultSubject: "Tu acceso al portal de {{studio_name}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Te creamos un acceso privado a tu portal. Tu código es <strong>{{access_code}}</strong>.</p><p>Entrá en {{portal_url}}.</p>`,
    variables: [
      { key: "client_name", label: "Nombre del cliente", example: "Juan Pérez" },
      { key: "studio_name", label: "Nombre del estudio", example: "Abby Pixel" },
      { key: "access_code", label: "Código de acceso", example: "ABCD2345" },
      { key: "portal_url", label: "URL del portal", example: "https://app.studioflow.com/portal/login" },
      { key: "client_email", label: "Email del cliente", example: "cliente@email.com" },
    ],
  },
  booking_confirmed: {
    label: "Reserva confirmada",
    description: "Se envía al confirmar una reserva.",
    category: "booking",
    defaultSubject: "Reserva confirmada — {{event_date}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Confirmamos tu reserva para el {{event_date}} a las {{event_time}} en {{event_location}}.</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "event_date", label: "Fecha del evento", example: "15 de junio de 2026" },
      { key: "event_time", label: "Hora", example: "14:30" },
      { key: "event_location", label: "Ubicación", example: "Av. Siempre Viva 123" },
      { key: "package_name", label: "Paquete", example: "Boda Premium" },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
    ],
  },
  booking_reminder: {
    label: "Recordatorio de sesión",
    description: "Recordatorio antes del evento.",
    category: "booking",
    defaultSubject: "Recordatorio — tu sesión es el {{event_date}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Te recordamos que tu sesión es el {{event_date}} a las {{event_time}}.</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "event_date", label: "Fecha", example: "15 jun 2026" },
      { key: "event_time", label: "Hora", example: "14:30" },
      { key: "event_location", label: "Ubicación", example: "Estudio" },
    ],
  },
  booking_cancelled: {
    label: "Reserva cancelada",
    description: "Se envía al cancelar una reserva.",
    category: "booking",
    defaultSubject: "Reserva cancelada — {{event_date}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Tu reserva para el {{event_date}} fue cancelada.</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "event_date", label: "Fecha", example: "15 jun" },
    ],
  },
  booking_rescheduled: {
    label: "Cambio de fecha",
    description: "Notifica al cliente cuando cambia la fecha.",
    category: "booking",
    defaultSubject: "Tu sesión cambió al {{event_date}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Tu sesión fue movida al {{event_date}} a las {{event_time}}.</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "event_date", label: "Nueva fecha", example: "20 jun" },
      { key: "event_time", label: "Hora", example: "14:00" },
    ],
  },
  contract_sent: {
    label: "Contrato enviado al cliente",
    description: "Se envía al cliente con el link para firmar.",
    category: "contract",
    defaultSubject: "Contrato por firmar — {{contract_title}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>{{studio_name}} te envió el contrato {{contract_title}} para firmar online.</p><p><a href="{{signing_url}}" class="btn">Revisar y firmar</a></p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
      { key: "contract_title", label: "Título del contrato", example: "Boda — paquete Premium" },
      { key: "signing_url", label: "URL de firma", example: "https://app.studioflow.com/sign/abc123" },
    ],
  },
  contract_viewed_studio: {
    label: "Cliente abrió el contrato",
    description: "Notif al studio cuando el cliente abre el contrato.",
    category: "contract",
    defaultSubject: "{{client_name}} abrió el contrato",
    defaultBodyHtml:
      `<p>{{client_name}} abrió el contrato {{contract_title}}. Te avisaremos cuando firme.</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "contract_title", label: "Título", example: "Boda" },
    ],
  },
  contract_signed_client_studio: {
    label: "Cliente firmó (al estudio)",
    description: "Notif al studio cuando el cliente firmó.",
    category: "contract",
    defaultSubject: "{{client_name}} firmó el contrato",
    defaultBodyHtml:
      `<p>{{client_name}} firmó {{contract_title}}. {{pending_studio_signature|Falta tu firma para completarlo.}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "contract_title", label: "Título", example: "Boda" },
      { key: "pending_studio_signature", label: "Texto si falta tu firma", example: "Falta tu firma." },
    ],
  },
  contract_signed_studio_client: {
    label: "Estudio firmó (al cliente)",
    description: "Notif al cliente cuando el estudio firmó.",
    category: "contract",
    defaultSubject: "{{studio_name}} firmó tu contrato",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>{{studio_name}} firmó {{contract_title}}.</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
      { key: "contract_title", label: "Título", example: "Boda" },
    ],
  },
  contract_completed_copy: {
    label: "Copia final del contrato",
    description: "Copia HTML completa enviada al cliente y al estudio.",
    category: "contract",
    defaultSubject: "Copia final — {{contract_title}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Adjunto la copia final del contrato firmado.</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "contract_title", label: "Título", example: "Boda" },
    ],
  },
  invoice_created: {
    label: "Factura creada",
    description: "Notifica al cliente que hay una factura nueva.",
    category: "invoice",
    defaultSubject: "Nueva factura — {{invoice_number}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Te enviamos la factura {{invoice_number}} por {{total_price}}. Vence el {{due_date}}.</p><p><a href="{{payment_url}}" class="btn">Pagar ahora</a></p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "invoice_number", label: "Número de factura", example: "INV-001" },
      { key: "total_price", label: "Total", example: "$1,500.00" },
      { key: "due_date", label: "Vencimiento", example: "15 jun 2026" },
      { key: "payment_url", label: "Link de pago", example: "https://..." },
    ],
  },
  payment_received: {
    label: "Pago recibido",
    description: "Confirma al cliente que su pago se acreditó.",
    category: "invoice",
    defaultSubject: "Recibimos tu pago — {{amount_paid}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Confirmamos tu pago de {{amount_paid}}. {{remaining_balance|Tu cuenta está al día.}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "amount_paid", label: "Monto pagado", example: "$500.00" },
      { key: "remaining_balance", label: "Saldo pendiente", example: "$0.00" },
    ],
  },
  payment_pending: {
    label: "Pago pendiente",
    description: "Recordatorio de pago vencido o por vencer.",
    category: "invoice",
    defaultSubject: "Pago pendiente — {{invoice_number}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Te recordamos que la factura {{invoice_number}} por {{total_price}} está pendiente de pago.</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "invoice_number", label: "Número", example: "INV-001" },
      { key: "total_price", label: "Monto", example: "$1,500.00" },
      { key: "due_date", label: "Vencimiento", example: "15 jun" },
      { key: "payment_url", label: "Link de pago", example: "https://..." },
    ],
  },
  gallery_available: {
    label: "Galería disponible",
    description: "Notifica al cliente que su galería está lista.",
    category: "gallery",
    defaultSubject: "Tu galería está lista — {{gallery_name}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Tu galería {{gallery_name}} está lista. <a href="{{gallery_url}}" class="btn">Verla acá</a>.</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "gallery_name", label: "Nombre de galería", example: "Boda Pérez" },
      { key: "gallery_url", label: "URL de galería", example: "https://..." },
    ],
  },
  gallery_selection_pending: {
    label: "Selección pendiente",
    description: "Recordatorio de seleccionar fotos.",
    category: "gallery",
    defaultSubject: "Recordatorio — selecciona tus fotos",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Aún no recibimos tu selección de fotos para {{gallery_name}}.</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "gallery_name", label: "Galería", example: "Boda Pérez" },
      { key: "gallery_url", label: "URL", example: "https://..." },
    ],
  },
  gallery_expiring: {
    label: "Galería por vencer",
    description: "Avisa al cliente que su galería va a expirar pronto.",
    category: "gallery",
    defaultSubject: "Tu galería expira pronto — {{gallery_name}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Tu galería {{gallery_name}} expira el {{expires_at}}. Descargá tus fotos antes.</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "gallery_name", label: "Galería", example: "Boda Pérez" },
      { key: "expires_at", label: "Vencimiento", example: "30 jun" },
      { key: "gallery_url", label: "URL", example: "https://..." },
    ],
  },
  gallery_selection_received: {
    label: "Selección recibida",
    description: "Confirma al cliente que su selección de fotos fue recibida.",
    category: "gallery",
    defaultSubject: "Recibimos tu selección — {{gallery_name}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>¡Recibimos tu selección de <strong>{{gallery_name}}</strong>! Ya comenzamos a trabajar en ella y te avisaremos cuando tu entrega esté lista.</p><p>— {{studio_name}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "gallery_name", label: "Galería", example: "Boda Pérez" },
      { key: "project_name", label: "Proyecto", example: "Boda 2026" },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
    ],
  },
  gallery_expired: {
    label: "Galería vencida",
    description: "Avisa al cliente que su galería dejó de estar disponible.",
    category: "gallery",
    defaultSubject: "Tu galería expiró — {{gallery_name}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Tu galería <strong>{{gallery_name}}</strong> dejó de estar disponible el {{expiration_date}}. Si necesitás recuperarla, respondé este correo.</p><p>— {{studio_name}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "gallery_name", label: "Galería", example: "Boda Pérez" },
      { key: "expiration_date", label: "Venció el", example: "30 jun 2026" },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
    ],
  },
  gallery_final_delivery_available: {
    label: "Entrega final disponible",
    description: "Avisa al cliente que sus fotos editadas (entrega final) ya están listas.",
    category: "gallery",
    defaultSubject: "✨ Tus fotos están listas — {{gallery_name}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>¡Tus fotos editadas de <strong>{{gallery_name}}</strong> ya están disponibles! <a href="{{gallery_link}}" class="btn">Verlas y descargarlas acá</a>.</p><p>Disponible hasta el {{expiration_date}}.</p><p>— {{studio_name}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "gallery_name", label: "Galería", example: "Boda Pérez" },
      { key: "project_name", label: "Proyecto", example: "Boda 2026" },
      { key: "gallery_link", label: "Link de la galería", example: "https://..." },
      { key: "expiration_date", label: "Disponible hasta", example: "30 jun 2026" },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
    ],
  },
  gallery_drive_link_available: {
    label: "Link de Drive disponible",
    description: "Comparte con el cliente el link de respaldo en Google Drive.",
    category: "gallery",
    defaultSubject: "Tu respaldo en Drive — {{gallery_name}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Te dejamos el respaldo de <strong>{{gallery_name}}</strong> en Google Drive: <a href="{{drive_link}}" class="btn">abrir carpeta</a>.</p><p>— {{studio_name}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "gallery_name", label: "Galería", example: "Boda Pérez" },
      { key: "drive_link", label: "Link de Drive", example: "https://drive.google.com/..." },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
    ],
  },
  delivery_ready: {
    label: "Entrega lista",
    description: "Notifica al cliente que sus fotos editadas están listas.",
    category: "delivery",
    defaultSubject: "{{delivery_title}} — tu entrega está lista",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p>
<p>¡Buenas noticias! Tu entrega <strong>{{delivery_title}}</strong> ya está disponible. Podés verla y descargarla acá: <a href="{{portal_url}}" class="btn">Ver mi entrega</a></p>
<div style="margin:20px 0;padding:14px 16px;border-left:3px solid #b89968;background:#fbf6ed;border-radius:4px">
  <p style="margin:0 0 8px;font-weight:600;color:#1a1614">⏳ Importante — guardá tus fotos antes de 6 meses</p>
  <p style="margin:0;color:#3a322b;font-size:14px;line-height:1.5">
    Las fotografías estarán disponibles en tu galería privada por <strong>6 meses</strong> desde hoy.
    Te recomendamos <strong>descargarlas y guardarlas</strong> en al menos dos lugares (computadora,
    disco externo o nube personal). Pasado ese plazo, no nos hacemos responsables por la pérdida del material.
  </p>
</div>
<p>¡Esperamos que te encanten! Si tienes cualquier duda, escríbenos por WhatsApp con el botón de abajo.</p>
<p>— {{studio_name}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "delivery_title", label: "Título de entrega", example: "Fotos editadas — Boda" },
      { key: "portal_url", label: "URL del portal", example: "https://..." },
      { key: "studio_name", label: "Estudio", example: "AbbyPixel" },
    ],
  },
  prints_ready: {
    label: "Impresiones listas",
    description: "Notifica al cliente que sus impresiones están listas para retirar.",
    category: "delivery",
    defaultSubject: "Tus impresiones están listas",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Tus impresiones ya están listas para retirar.</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "Juan" },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
    ],
  },
  engagement_birthday_soon: {
    label: "Cumpleaños — antes",
    description: "Saludo previo al cumpleaños del cliente (Engagement Hub).",
    category: "engagement",
    defaultSubject: "🎂 Ya casi es tu cumpleaños, {{client_name}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}} 👋</p><p>Ya falta poco para tu cumpleaños. Esperamos que este nuevo año esté lleno de momentos increíbles.</p><p>— {{studio_name}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "María" },
      { key: "birthday", label: "Cumpleaños", example: "20 may" },
      { key: "discount_code", label: "Código de descuento", example: "CUMPLE20" },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
    ],
  },
  engagement_birthday_greeting: {
    label: "Cumpleaños — el día",
    description: "Felicitación el día del cumpleaños del cliente (Engagement Hub).",
    category: "engagement",
    defaultSubject: "🎉 ¡Feliz cumpleaños, {{client_name}}!",
    defaultBodyHtml:
      `<p>¡Feliz cumpleaños {{client_name}}! 🎉</p><p>Esperamos que disfrutes muchísimo tu día. Gracias por permitirnos formar parte de momentos tan especiales.</p><p>— {{studio_name}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "María" },
      { key: "discount_code", label: "Código de descuento", example: "CUMPLE20" },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
    ],
  },
  engagement_post_delivery: {
    label: "Post-entrega — feedback",
    description: "Agradecimiento + encuesta tras la entrega final (Engagement Hub).",
    category: "engagement",
    defaultSubject: "¿Cómo fue tu experiencia con {{studio_name}}?",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>¡Gracias por confiar en nosotros para {{project_name}}! Nos encantaría saber cómo fue tu experiencia.</p><p><a href="{{review_link}}" class="btn">Cuéntanos aquí →</a></p><p>— {{studio_name}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "María" },
      { key: "project_name", label: "Proyecto", example: "Quinceañera" },
      { key: "delivery_date", label: "Fecha de entrega", example: "08 jun 2026" },
      { key: "review_link", label: "Link de encuesta/reseña", example: "https://..." },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
    ],
  },
  engagement_reengagement: {
    label: "Reactivación — inactividad",
    description: "Reconecta con clientes que no reservan hace tiempo (Engagement Hub).",
    category: "engagement",
    defaultSubject: "Hace tiempo que no hablamos 😊",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Hace tiempo que no hablamos 😊 Queríamos saludarte y mostrarte nuestras nuevas experiencias.</p><p>Si reservas pronto, usa <strong>{{discount_code}}</strong>.</p><p>— {{studio_name}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "María" },
      { key: "discount_code", label: "Código de descuento", example: "VUELVE15" },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
    ],
  },
  engagement_review_request: {
    label: "Solicitud de reseña / testimonio",
    description: "Pide una reseña en Google/Facebook o un testimonio (Engagement Hub).",
    category: "engagement",
    defaultSubject: "Nos encantaría conocer tu opinión, {{client_name}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Nos encantaría conocer tu opinión. Tu reseña nos ayuda muchísimo.</p><p><a href="{{review_link}}" class="btn">Dejar mi reseña →</a></p><p>— {{studio_name}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "María" },
      { key: "review_link", label: "Link de reseña", example: "https://g.page/..." },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
    ],
  },
  engagement_generic: {
    label: "Engagement — genérico",
    description: "Plantilla base editable para campañas de fidelización (Engagement Hub).",
    category: "engagement",
    defaultSubject: "Un mensaje de {{studio_name}}",
    defaultBodyHtml:
      `<p>Hola {{client_name}},</p><p>Queríamos saludarte.</p><p>— {{studio_name}}</p>`,
    variables: [
      { key: "client_name", label: "Cliente", example: "María" },
      { key: "studio_name", label: "Estudio", example: "Abby Pixel" },
    ],
  },
}

export type EmailTemplateRow = {
  id: string
  studio_id: string
  slug: string
  name: string
  subject: string
  body_html: string
  body_text: string | null
  from_name: string | null
  reply_to: string | null
  is_active: boolean
}

/**
 * Devuelve el template del studio para un slug, o null si no existe.
 * Si existe pero is_active=false, también devuelve null (igual a no tenerlo).
 */
export async function getStudioTemplate(
  studioId: string,
  slug: TemplateSlug,
): Promise<EmailTemplateRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from("email_templates")
    .select(
      "id, studio_id, slug, name, subject, body_html, body_text, from_name, reply_to, is_active",
    )
    .eq("studio_id", studioId)
    .eq("slug", slug)
    .maybeSingle()
  const row = data as EmailTemplateRow | null
  if (!row) return null
  if (!row.is_active) return null
  return row
}

export async function listStudioTemplates(studioId: string): Promise<EmailTemplateRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from("email_templates")
    .select(
      "id, studio_id, slug, name, subject, body_html, body_text, from_name, reply_to, is_active",
    )
    .eq("studio_id", studioId)
  if (error) throw error
  return (data ?? []) as EmailTemplateRow[]
}

export async function upsertStudioTemplate(
  studioId: string,
  input: {
    slug: TemplateSlug
    name?: string
    subject: string
    body_html: string
    body_text?: string | null
    from_name?: string | null
    reply_to?: string | null
    is_active?: boolean
  },
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const catalogEntry = TEMPLATE_CATALOG[input.slug]
  const name = input.name ?? catalogEntry?.label ?? input.slug
  const { error } = await supabase
    .from("email_templates")
    .upsert(
      {
        studio_id: studioId,
        slug: input.slug,
        name,
        subject: input.subject,
        body_html: input.body_html,
        body_text: input.body_text ?? null,
        from_name: input.from_name ?? null,
        reply_to: input.reply_to ?? null,
        is_active: input.is_active ?? true,
        is_system: false,
        metadata: {},
      },
      { onConflict: "studio_id,slug" },
    )
  if (error) throw error
}

/** Renderiza {{var}} y {{var|fallback}} con valores reales. */
export function renderTemplate(
  body: string,
  vars: Record<string, string | null | undefined>,
  fallback = "",
): string {
  return body.replace(
    /\{\{\s*([\w-]+)(?:\s*\|\s*([^}]+))?\s*\}\}/g,
    (_, key: string, inlineFallback?: string) => {
      const val = vars[key]
      if (val !== undefined && val !== null && val !== "") return String(val)
      if (inlineFallback) return inlineFallback.trim()
      return fallback
    },
  )
}

/**
 * Aplica template del studio si existe; sino devuelve `defaults`.
 * Renderiza tanto subject como body con `vars`.
 */
export async function resolveTemplate(
  studioId: string,
  slug: TemplateSlug,
  vars: Record<string, string | null | undefined>,
  defaults: { subject: string; bodyHtml: string },
): Promise<{ subject: string; bodyHtml: string; fromName: string | null; replyTo: string | null }> {
  const tpl = await getStudioTemplate(studioId, slug)
  const subjectRaw = tpl?.subject ?? defaults.subject
  const bodyRaw = tpl?.body_html ?? defaults.bodyHtml
  const innerHtml = renderTemplate(bodyRaw, vars)

  // Marco luxury (header del estudio + tipografía serif + botones dorados).
  // Si la plantilla del studio ya trae un documento HTML completo (<html…),
  // se respeta tal cual; sino se envuelve.
  let bodyHtml = innerHtml
  if (!/<html[\s>]/i.test(innerHtml)) {
    try {
      const { wrapLuxuryEmail } = await import("@/lib/email/luxury-layout")
      const branding = await getEmailBranding(studioId)
      bodyHtml = wrapLuxuryEmail(innerHtml, {
        studioName:
          (vars["studio_name"] as string | undefined) || branding.studioName,
        logoUrl: branding.logoUrl,
        accent: branding.accent,
        footerHtml: branding.footerHtml,
        contactLine: branding.contactLine,
        whatsappUrl: branding.whatsappUrl,
        social: branding.social,
      })
    } catch (e) {
      console.error("[email] wrapLuxuryEmail falló, se envía sin marco", e)
    }
  }

  return {
    subject: renderTemplate(subjectRaw, vars),
    bodyHtml,
    fromName: tpl?.from_name ?? null,
    replyTo: tpl?.reply_to ?? null,
  }
}

/** Branding del estudio para el marco de email (logo, color, nombre, footer). */
export async function getEmailBranding(studioId: string): Promise<{
  studioName: string
  logoUrl: string | null
  accent: string | null
  footerHtml: string | null
  contactLine: string | null
  whatsappUrl: string | null
  social: {
    instagramUrl: string | null
    facebookUrl: string | null
    websiteUrl: string | null
  }
}> {
  const { untypedService } = await import("@/server/supabase/untyped")
  const { formatDoPhone } = await import("@/lib/whatsapp/templates")
  const sb = untypedService()
  const [{ data: studio }, { data: branding }] = await Promise.all([
    sb.from("studios").select("name, email, phone").eq("id", studioId).maybeSingle(),
    sb
      .from("studio_branding")
      .select(
        "logo_url, primary_color, custom_footer_html, instagram_url, facebook_url, website_url",
      )
      .eq("studio_id", studioId)
      .maybeSingle(),
  ])
  const s = studio as { name?: string; email?: string | null; phone?: string | null } | null
  const b = branding as {
    logo_url?: string | null
    primary_color?: string | null
    custom_footer_html?: string | null
    instagram_url?: string | null
    facebook_url?: string | null
    website_url?: string | null
  } | null
  const contactBits = [s?.email, s?.phone].filter(Boolean) as string[]
  const waPhone = formatDoPhone(s?.phone)
  const whatsappUrl = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent("Hola, tengo una consulta 😊")}`
    : null
  return {
    studioName: s?.name ?? "",
    logoUrl: b?.logo_url ?? null,
    accent: b?.primary_color ?? null,
    footerHtml: b?.custom_footer_html ?? null,
    contactLine: contactBits.length ? contactBits.join(" · ") : null,
    whatsappUrl,
    social: {
      instagramUrl: b?.instagram_url ?? null,
      facebookUrl: b?.facebook_url ?? null,
      websiteUrl: b?.website_url ?? null,
    },
  }
}
