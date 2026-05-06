import sanitize from "sanitize-html"

/**
 * Sanitiza HTML para uso seguro con dangerouslySetInnerHTML.
 * Usamos `sanitize-html` (server-friendly, sin jsdom) en vez de
 * `isomorphic-dompurify` para evitar el bundling de jsdom (~5MB) y
 * runtime errors en hosting cPanel/Passenger donde jsdom no se resuelve.
 *
 * Allowlist conservadora: tags de formato + links + imágenes,
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
]

const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "width", "height", "title"],
  // Atributos de formato compartidos
  "*": ["class"],
  th: ["colspan", "rowspan", "scope"],
  td: ["colspan", "rowspan"],
}

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
  return sanitize(html, {
    allowedTags: SAFE_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ["http", "https", "mailto", "tel", "callto", "cid", "xmpp"],
    allowedSchemesByTag: {
      img: ["http", "https", "data"], // data: ok solo en imágenes
    },
    allowProtocolRelative: true,
    transformTags: {
      // Forzar rel="noopener noreferrer" en links externos
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.target === "_blank"
            ? { rel: "noopener noreferrer" }
            : attribs.rel
              ? { rel: attribs.rel }
              : {}),
        },
      }),
    },
    disallowedTagsMode: "discard",
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
