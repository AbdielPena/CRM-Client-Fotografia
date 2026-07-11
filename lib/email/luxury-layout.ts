/**
 * Envoltorio luxury para todos los emails de cara al cliente.
 *
 * Toma el `inner` (los <p>/<a> de la plantilla) y lo enmarca en un email
 * HTML completo: header con el nombre del estudio, tipografía serif elegante,
 * acentos dorados, botones estilizados y footer. Compatible con Gmail / Apple
 * Mail / Outlook.com (usa `<style>` embebido + estilos inline en lo crítico).
 *
 * Las plantillas pueden marcar su CTA con <a class="btn">…</a> para que se
 * renderice como botón dorado; cualquier otro <a> queda como link dorado.
 */

// Paleta minimalista (flat, blanco — alineada al rediseño global).
const INK = "#1C1C1C"
const INK_SOFT = "#6E6E73"
const INK_FAINT = "#A1A1A6"
const BG = "#F0F1F4"
const CARD = "#FFFFFF"
const LINE = "#ECECEF"
// Default de acento = tinta (los estudios pueden sobreescribir con su color).
const GOLD = INK
const GOLD_DARK = INK

export interface LuxuryEmailOptions {
  studioName: string
  logoUrl?: string | null
  accent?: string | null
  footerHtml?: string | null
  /** Pie con dirección/contacto. */
  contactLine?: string | null
  /** Link wa.me del estudio — muestra un botón "Escríbenos por WhatsApp". */
  whatsappUrl?: string | null
  /** Redes sociales — se muestran como íconos en el footer. */
  social?: {
    instagramUrl?: string | null
    facebookUrl?: string | null
    websiteUrl?: string | null
  } | null
}

/** Botón verde de WhatsApp para el footer del email. */
function whatsappRow(url?: string | null): string {
  if (!url) return ""
  return `<div style="margin:0 0 16px;text-align:center;">
    <a href="${escapeAttr(url)}" style="display:inline-block;padding:11px 22px;border-radius:999px;background:#25D366;color:#fff;font-weight:600;font-size:13px;text-decoration:none;">
      <img src="${ICON_BASE}/whatsapp.png" alt="" width="16" height="16" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;border:0;" />¿Tienes dudas? Escríbenos por WhatsApp
    </a></div>`
}

/** Base pública donde viven los íconos PNG de redes (Gmail no renderiza SVG). */
const ICON_BASE = "https://abbypixel.com/assets/email"

function socialRow(social: LuxuryEmailOptions["social"]): string {
  if (!social) return ""
  const items: Array<{ url: string; icon: string; alt: string }> = []
  if (social.instagramUrl)
    items.push({ url: social.instagramUrl, icon: "instagram.png", alt: "Instagram" })
  if (social.facebookUrl)
    items.push({ url: social.facebookUrl, icon: "facebook.png", alt: "Facebook" })
  if (social.websiteUrl)
    items.push({ url: social.websiteUrl, icon: "web.png", alt: "Sitio web" })
  if (items.length === 0) return ""
  const cells = items
    .map(
      (it) =>
        `<a href="${escapeAttr(it.url)}" style="display:inline-block;margin:0 7px;text-decoration:none;"><img src="${ICON_BASE}/${it.icon}" alt="${it.alt}" width="22" height="22" style="width:22px;height:22px;border:0;display:inline-block;opacity:.85;" /></a>`,
    )
    .join("")
  return `<div style="margin:0 0 12px;">${cells}</div>`
}

export function wrapLuxuryEmail(inner: string, opts: LuxuryEmailOptions): string {
  const accent = sanitizeColor(opts.accent) || GOLD
  const studio = escapeHtml(opts.studioName || "")
  const year = "—" // se reemplaza fuera si hace falta; evitamos Date.now() aquí.

  // Logo dentro de un chip oscuro (así un logo blanco/claro siempre se ve sobre
  // el header blanco del email). Si no hay logo, mostramos el nombre del estudio.
  const header = opts.logoUrl
    ? `<span style="display:inline-block;background:${INK};border-radius:12px;padding:12px 20px;line-height:0;"><img src="${escapeAttr(opts.logoUrl)}" alt="${studio}" height="26" style="height:26px;width:auto;max-width:200px;display:block;" /></span>`
    : `<div style="font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif;font-size:20px;font-weight:600;letter-spacing:-.01em;color:${INK};">${studio}</div>`

  const footer = opts.footerHtml
    ? opts.footerHtml
    : `<p style="margin:0;">${studio}${opts.contactLine ? ` · ${escapeHtml(opts.contactLine)}` : ""}</p>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<style>
  body { margin:0; padding:0; background:${BG}; }
  .lx-wrap { width:100%; background:${BG}; padding:40px 14px;
             font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; }
  .lx-card { max-width:620px; margin:0 auto; background:${CARD}; border:1px solid ${LINE};
             border-radius:20px; overflow:hidden; }
  .lx-head { padding:34px 40px; text-align:center; border-bottom:1px solid ${LINE}; }
  .lx-body { padding:40px 44px 34px;
             font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;
             font-size:15px; line-height:1.7; color:${INK_SOFT}; }
  .lx-body p { margin:0 0 16px; }
  .lx-body h1,.lx-body h2 { font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif;
             color:${INK}; font-weight:600; line-height:1.22; margin:0 0 14px;
             letter-spacing:-.015em; }
  .lx-body h1 { font-size:25px; }
  .lx-body h2 { font-size:19px; }
  .lx-body strong { color:${INK}; font-weight:600; }
  .lx-body a { color:${INK}; text-decoration:underline; }
  .lx-body a.btn, .lx-body .btn {
    display:inline-block; margin:8px 0 4px; padding:14px 28px; border-radius:12px;
    background:${accent}; color:#fff !important; font-weight:500; font-size:15px;
    text-decoration:none !important; letter-spacing:0; box-shadow:none; }
  .lx-foot { padding:24px 40px 32px; text-align:center; border-top:1px solid ${LINE};
             font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif; font-size:11.5px;
             line-height:1.6; color:${INK_FAINT}; }
  .lx-foot a { color:${INK_FAINT}; }
</style>
</head>
<body>
<div class="lx-wrap">
  <div class="lx-card">
    <div class="lx-head">${header}</div>
    <div class="lx-body">
${inner}
    </div>
    <div class="lx-foot">
      ${whatsappRow(opts.whatsappUrl)}
      ${socialRow(opts.social)}
      ${footer}
      <p style="margin:10px 0 0;">💌 Para no perderte nada, agrega este correo a tus contactos.</p>
      <p style="margin:8px 0 0;opacity:.8;">Este mensaje es solo para ti.${year === "—" ? "" : ` © ${year}`}</p>
    </div>
  </div>
</div>
</body>
</html>`
}

/** Botón inline para usar dentro de plantillas (server-side, sin clases CSS). */
export function emailButton(label: string, href: string, accent = GOLD): string {
  return `<a href="${escapeAttr(href)}" class="btn" style="display:inline-block;padding:13px 26px;border-radius:999px;background:${accent};color:#fff;font-weight:600;font-size:14px;text-decoration:none;letter-spacing:.2px;">${escapeHtml(label)}</a>`
}

function sanitizeColor(c?: string | null): string | null {
  if (!c) return null
  return /^#[0-9a-fA-F]{3,8}$/.test(c.trim()) ? c.trim() : null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;")
}
