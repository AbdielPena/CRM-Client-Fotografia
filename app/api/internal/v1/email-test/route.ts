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
  logoUrl: null, // logo blanco no se vería en header blanco → mostramos el nombre
  accent: null as string | null,
  whatsappUrl: "https://wa.me/18090000000",
  social: {
    instagramUrl: "https://instagram.com/abbypixel",
    facebookUrl: "https://facebook.com/abbypixel",
    websiteUrl: "https://abbypixel.com",
  },
}

const SAMPLES: { key: string; subject: string; inner: string }[] = [
  {
    key: "portal-access",
    subject: "[Prueba] Tu acceso al portal — PixelOS",
    inner: `<h1>Bienvenida a tu portal, Betzabeth</h1>
<p>Creamos tu espacio privado donde verás tus galerías, contratos, facturas y entregas.</p>
<p>Tu código de acceso: <strong>A1B2C3</strong></p>
<p>${emailButton("Entrar a mi portal", "https://my.abbypixel.com/portal")}</p>`,
  },
  {
    key: "payment-received",
    subject: "[Prueba] Pago recibido — PixelOS",
    inner: `<h1>Gracias, registramos tu pago</h1>
<p>Confirmamos el pago de tu factura <strong>INV-2026-00007</strong>.</p>
<p><strong>Método:</strong> Efectivo · <strong>Fecha:</strong> 12 jun 2026<br/><strong>Total pagado:</strong> DOP 6,000.00</p>
<p>${emailButton("Ver en mi portal", "https://my.abbypixel.com/portal/payments")}</p>`,
  },
  {
    key: "invoice-sent",
    subject: "[Prueba] Tu factura está lista — PixelOS",
    inner: `<h1>Factura INV-2026-00008</h1>
<p>Te compartimos tu factura por <strong>DOP 12,500.00</strong>, con vencimiento el 20 de junio.</p>
<p>${emailButton("Ver y pagar factura", "https://my.abbypixel.com/portal/invoices")}</p>`,
  },
  {
    key: "gallery-share",
    subject: "[Prueba] Tus fotos están listas — PixelOS",
    inner: `<h1>¡Tu galería ya está disponible!</h1>
<p>Selecciona tus favoritas y descárgalas cuando quieras. El enlace es privado y solo para ti.</p>
<p>${emailButton("Ver mi galería", "https://my.abbypixel.com/g/demo")}</p>`,
  },
  {
    key: "final-delivery",
    subject: "[Prueba] Tu entrega final está lista — PixelOS",
    inner: `<h1>Tu entrega final está lista</h1>
<p>Terminamos la edición de tus fotos. Aquí tienes la entrega en máxima calidad, lista para descargar.</p>
<p>${emailButton("Descargar entrega final", "https://my.abbypixel.com/g/demo")}</p>`,
  },
  {
    key: "gallery-reminder",
    subject: "[Prueba] No olvides ver tu galería — PixelOS",
    inner: `<h1>Aún no has visto tu galería</h1>
<p>Te dejamos el enlace de nuevo por si se te traspapeló. Tus fotos te están esperando.</p>
<p>${emailButton("Abrir galería", "https://my.abbypixel.com/g/demo")}</p>`,
  },
  {
    key: "contract-sent",
    subject: "[Prueba] Contrato para firmar — PixelOS",
    inner: `<h1>Tu contrato está listo para firmar</h1>
<p>Revisa los términos de tu sesión y fírmalo digitalmente en un par de clics.</p>
<p>${emailButton("Revisar y firmar", "https://my.abbypixel.com/sign/demo")}</p>`,
  },
  {
    key: "review-request",
    subject: "[Prueba] ¿Cómo fue tu experiencia? — PixelOS",
    inner: `<h1>¿Nos dejas tu opinión?</h1>
<p>Tu experiencia nos ayuda muchísimo. Cuéntanos cómo te fue — solo toma un minuto. ★★★★★</p>
<p>${emailButton("Dejar mi reseña", "https://my.abbypixel.com/r/demo")}</p>`,
  },
  {
    key: "reset-password",
    subject: "[Prueba] Restablece tu contraseña — PixelOS",
    inner: `<h1>Restablece tu contraseña</h1>
<p>Recibimos una solicitud para restablecer tu contraseña. El enlace expira en 1 hora.</p>
<p>${emailButton("Crear nueva contraseña", "https://hub.abbypixel.com/reset-password")}</p>`,
  },
  {
    key: "team-invite",
    subject: "[Prueba] Te invitaron al estudio — PixelOS",
    inner: `<h1>Te invitaron a unirte a AbbyPixel</h1>
<p>Únete al equipo para colaborar en clientes, proyectos y entregas.</p>
<p>${emailButton("Aceptar invitación", "https://my.abbypixel.com/invite/demo")}</p>`,
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
