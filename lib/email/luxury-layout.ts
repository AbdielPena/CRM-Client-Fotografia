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

const GOLD = "#b89968"
const GOLD_DARK = "#9a7d52"
const INK = "#1a1614"
const INK_SOFT = "#4a4640"
const CREAM = "#faf8f4"
const CARD = "#ffffff"

export interface LuxuryEmailOptions {
  studioName: string
  logoUrl?: string | null
  accent?: string | null
  footerHtml?: string | null
  /** Pie con dirección/contacto. */
  contactLine?: string | null
  /** Redes sociales — se muestran como íconos en el footer. */
  social?: {
    instagramUrl?: string | null
    facebookUrl?: string | null
    websiteUrl?: string | null
  } | null
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

  const header = opts.logoUrl
    ? `<img src="${escapeAttr(opts.logoUrl)}" alt="${studio}" height="40" style="height:40px;width:auto;display:block;margin:0 auto;" />`
    : `<div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;letter-spacing:.5px;color:${INK};">${studio}</div>`

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
  body { margin:0; padding:0; background:${CREAM}; }
  .lx-wrap { width:100%; background:${CREAM}; padding:32px 12px; }
  .lx-card { max-width:560px; margin:0 auto; background:${CARD}; border-radius:18px;
             overflow:hidden; box-shadow:0 8px 40px -16px rgba(26,22,20,.22); }
  .lx-rule { height:3px; background:linear-gradient(90deg, ${accent} 0%, ${GOLD_DARK} 100%); }
  .lx-head { padding:34px 32px 8px; text-align:center; }
  .lx-body { padding:8px 32px 28px; font-family:'Helvetica Neue',Arial,sans-serif;
             font-size:15px; line-height:1.62; color:${INK_SOFT}; }
  .lx-body p { margin:0 0 16px; }
  .lx-body h1,.lx-body h2 { font-family:Georgia,'Times New Roman',serif; color:${INK};
             font-weight:500; line-height:1.25; margin:0 0 14px; }
  .lx-body h1 { font-size:23px; }
  .lx-body h2 { font-size:19px; }
  .lx-body strong { color:${INK}; }
  .lx-body a { color:${GOLD_DARK}; text-decoration:underline; }
  .lx-body a.btn, .lx-body .btn {
    display:inline-block; margin:6px 0 4px; padding:13px 26px; border-radius:999px;
    background:${accent}; color:#fff !important; font-weight:600; font-size:14px;
    text-decoration:none !important; letter-spacing:.2px;
    box-shadow:0 6px 18px -8px ${accent}; }
  .lx-foot { padding:20px 32px 30px; text-align:center;
             font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px;
             line-height:1.6; color:#9a958c; }
  .lx-foot a { color:#9a958c; }
</style>
</head>
<body>
<div class="lx-wrap">
  <div class="lx-card">
    <div class="lx-rule"></div>
    <div class="lx-head">${header}</div>
    <div class="lx-body">
${inner}
    </div>
    <div class="lx-foot">
      ${socialRow(opts.social)}
      ${footer}
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
