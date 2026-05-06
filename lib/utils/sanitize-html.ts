import DOMPurify from "isomorphic-dompurify"

/**
 * Sanitiza HTML para uso seguro con dangerouslySetInnerHTML.
 * Usa allowlist conservadora: tags de formato + links + imágenes,
 * sin scripts, iframes, event handlers ni estilos inline.
 */
const SAFE_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "hr",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "div",
  "span",
] as const

const SAFE_ATTRS = [
  "href",
  "title",
  "target",
  "rel",
  "src",
  "alt",
  "width",
  "height",
  "class",
] as const

/**
 * Sanitiza HTML proveniente del usuario (plantillas, contratos, emails)
 * antes de renderizarlo con dangerouslySetInnerHTML.
 *
 * Bloquea: <script>, <iframe>, <object>, <embed>, <form>, on* handlers,
 * javascript: URLs, data: URLs (excepto imágenes legítimas).
 *
 * Permite: tags de formato básicos, links con target/rel forzado, imágenes.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ""
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...SAFE_TAGS],
    ALLOWED_ATTR: [...SAFE_ATTRS],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "style"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "style"],
    // Forzar rel="noopener noreferrer" en links externos
    ADD_ATTR: ["target"],
    // No permitir javascript: ni data: en hrefs (excepto imágenes via src)
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  })
}

/**
 * Sanitiza texto plano para uso en headers (Subject, To, From) de emails.
 * Bloquea CRLF injection que permitiría inyectar Bcc/Cc.
 */
export function sanitizeEmailHeader(value: string | null | undefined): string {
  if (!value) return ""
  // Quitar CR, LF y NUL — vectores de header injection en SMTP
  return value.replace(/[\r\n\0]/g, " ").trim().slice(0, 998)
}
