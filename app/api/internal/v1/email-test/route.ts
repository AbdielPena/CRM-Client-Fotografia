import { NextResponse, type NextRequest } from "next/server"

import { wrapLuxuryEmail, emailButton } from "@/lib/email/luxury-layout"
import { sendEmail } from "@/server/services/smtp.service"

/**
 * POST /api/internal/v1/email-test?to=correo
 *
 * Envía UNA muestra de cada TIPO de correo (con el frame minimalista nuevo) al
 * destinatario, para validar visualmente todas las plantillas. Solo para pruebas.
 * Auth: Authorization: Bearer <DRIVE_CRON_TOKEN | TASK_REMINDERS_CRON_TOKEN>.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STUDIO_ID = "f0897743-9be7-49cf-9c19-b6bd54e717c8"
const DEFAULT_TO = "soyabdielpena@gmail.com"

const OPTS = {
  studioName: "AbbyPixel",
  logoUrl: "https://my.abbypixel.com/brand/abbypixel-logo.png", // se muestra en un chip oscuro
  accent: null as string | null,
  whatsappUrl: "https://wa.me/18090000000",
  social: {
    instagramUrl: "https://instagram.com/abbypixel",
    facebookUrl: "https://facebook.com/abbypixel",
    websiteUrl: "https://abbypixel.com",
  },
}

const PORTAL = "https://my.abbypixel.com/portal"
const FEEDBACK = "https://my.abbypixel.com/fb/25424ac58fbd426e99f507899489a4bd"

const SAMPLES: { key: string; subject: string; inner: string }[] = [
  {
    key: "portal-access",
    subject: "[Prueba] Bienvenida a tu portal — AbbyPixel",
    inner: `<h1>Tu espacio está listo, Betzabeth ✨</h1>
<p>Qué alegría tenerte. Creamos un rincón privado solo para ti, donde vivirás cada paso de tu experiencia: tus galerías, tus fotos finales, contratos y pagos — todo en un mismo lugar, cuando quieras.</p>
<p>Tu código de acceso es <strong>A1B2C3</strong>. Guárdalo a la mano.</p>
<p>${emailButton("Entrar a mi portal", PORTAL)}</p>`,
  },
  {
    key: "payment-received",
    subject: "[Prueba] Recibimos tu pago — gracias, Betzabeth",
    inner: `<h1>¡Gracias! Tu pago quedó registrado</h1>
<p>Confirmamos con cariño el pago de tu factura <strong>INV-2026-00007</strong>. Un paso más cerca de capturar tus momentos.</p>
<p><strong>Método:</strong> Efectivo &nbsp;·&nbsp; <strong>Fecha:</strong> 12 jun 2026<br/><strong>Total pagado:</strong> DOP 6,000.00</p>
<p>${emailButton("Ver el recibo en mi portal", PORTAL + "/payments")}</p>`,
  },
  {
    key: "invoice-sent",
    subject: "[Prueba] Tu factura está lista — AbbyPixel",
    inner: `<h1>Tu factura INV-2026-00008</h1>
<p>Te compartimos tu factura por <strong>DOP 12,500.00</strong>, con vencimiento el <strong>20 de junio</strong>. Puedes verla y pagarla en segundos desde tu portal.</p>
<p>Cualquier duda, aquí estamos para ayudarte con gusto.</p>
<p>${emailButton("Ver y pagar factura", PORTAL + "/invoices")}</p>`,
  },
  {
    key: "gallery-share",
    subject: "[Prueba] ¡Tus fotos ya están aquí! — AbbyPixel",
    inner: `<h1>El momento llegó: tu galería está lista 📸</h1>
<p>Pusimos todo nuestro corazón en cada toma. Tómate tu tiempo, revívelas y elige tus favoritas — el enlace es privado y solo para ti.</p>
<p>${emailButton("Ver mi galería", PORTAL + "/galleries")}</p>`,
  },
  {
    key: "final-delivery",
    subject: "[Prueba] Tu entrega final está lista — AbbyPixel",
    inner: `<h1>Tus recuerdos, listos para siempre</h1>
<p>Terminamos la edición con todo el detalle que mereces. Aquí tienes tu entrega final en máxima calidad, lista para descargar, imprimir y compartir con quien quieras.</p>
<p>Gracias por confiarnos esta historia. Ojalá la disfrutes tanto como nosotros disfrutamos crearla.</p>
<p>${emailButton("Descargar mi entrega final", PORTAL + "/deliveries")}</p>`,
  },
  {
    key: "gallery-reminder",
    subject: "[Prueba] Tus fotos te esperan — AbbyPixel",
    inner: `<h1>Tu galería sigue aquí, esperándote</h1>
<p>Notamos que aún no la has abierto y no queremos que te pierdas ni un instante. Te dejamos el enlace de nuevo, a un clic de distancia.</p>
<p>${emailButton("Abrir mi galería", PORTAL + "/galleries")}</p>`,
  },
  {
    key: "contract-sent",
    subject: "[Prueba] Tu contrato está listo para firmar — AbbyPixel",
    inner: `<h1>Demos el primer paso juntos</h1>
<p>Preparamos tu contrato con todos los detalles de tu sesión. Revísalo con calma y fírmalo digitalmente en un par de clics — sin imprimir nada.</p>
<p>${emailButton("Revisar y firmar", PORTAL + "/contracts")}</p>`,
  },
  {
    key: "review-request",
    subject: "[Prueba] ¿Cómo viviste tu experiencia? — AbbyPixel",
    inner: `<h1>Tu opinión significa el mundo para nosotros ★★★★★</h1>
<p>Fue un honor acompañarte. Nos encantaría saber cómo viviste tu experiencia con AbbyPixel — tu reseña nos ayuda a crecer y a seguir cuidando cada detalle para clientes como tú.</p>
<p>Solo te tomará un minuto.</p>
<p>${emailButton("Dejar mi reseña", FEEDBACK)}</p>`,
  },
  {
    key: "reset-password",
    subject: "[Prueba] Restablece tu contraseña — PixelOS",
    inner: `<h1>Restablece tu contraseña</h1>
<p>Recibimos una solicitud para restablecer tu contraseña. Crea una nueva con el botón de abajo — el enlace expira en 1 hora.</p>
<p>Si no fuiste tú, ignora este correo; tu contraseña no cambiará.</p>
<p>${emailButton("Crear nueva contraseña", "https://hub.abbypixel.com/forgot-password")}</p>`,
  },
  {
    key: "team-invite",
    subject: "[Prueba] Te invitaron a AbbyPixel — PixelOS",
    inner: `<h1>Te damos la bienvenida al equipo</h1>
<p>Te invitaron a colaborar en AbbyPixel. Únete para gestionar clientes, proyectos y entregas, todo desde un mismo lugar.</p>
<p>${emailButton("Aceptar invitación", "https://hub.abbypixel.com/login")}</p>`,
  },
]

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected = process.env.DRIVE_CRON_TOKEN || process.env.TASK_REMINDERS_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: "token no configurado" }, { status: 500 })
  if (token !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const to = new URL(req.url).searchParams.get("to") || DEFAULT_TO

  const results: { key: string; ok: boolean; error?: string }[] = []
  for (const s of SAMPLES) {
    const html = wrapLuxuryEmail(s.inner, OPTS)
    const r = await sendEmail({
      studioId: STUDIO_ID,
      to,
      toName: "Abdiel",
      subject: s.subject,
      html,
    })
    results.push({ key: s.key, ok: r.ok, error: r.error })
  }

  const sent = results.filter((r) => r.ok).length
  return NextResponse.json({ to, total: SAMPLES.length, sent, results })
}
