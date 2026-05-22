import sanitizeHtml from "sanitize-html"

/**
 * Sanitiza HTML de email para render seguro en la UI.
 *
 * Estrategia conservadora:
 *   - Whitelist de tags + attrs específicos de email (mailto, http(s), inline styles
 *     limitados)
 *   - Strip de todos los scripts, event handlers, iframes, forms
 *   - Permite cid: en src (inline images via mail_attachments) — el UI debe
 *     resolver el cid → signed Storage URL antes de render
 *   - Permite mailto:, http(s):, tel:
 *   - data:image/* permitido para images embebidas raras
 *
 * IMPORTANTE: el output NO es totalmente XSS-safe contra zero-days de
 * sanitize-html. Para máxima seguridad, renderizar el HTML en un iframe
 * sandbox separado (TODO V2).
 */
export function sanitizeEmailHtml(input: string | null | undefined): string {
  if (!input) return ""

  return sanitizeHtml(input, {
    allowedTags: [
      // Estructura
      "html",
      "body",
      "div",
      "span",
      "p",
      "br",
      "hr",
      // Headings
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      // Texto
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "del",
      "ins",
      "sub",
      "sup",
      "small",
      "mark",
      // Listas
      "ul",
      "ol",
      "li",
      "dl",
      "dt",
      "dd",
      // Links + media
      "a",
      "img",
      // Tablas (emails usan tablas para layout)
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "caption",
      "colgroup",
      "col",
      // Blockquote + code
      "blockquote",
      "pre",
      "code",
      "kbd",
      "samp",
      "var",
      // Otros
      "abbr",
      "address",
      "cite",
      "q",
      "time",
      "figure",
      "figcaption",
    ],
    allowedAttributes: {
      "*": ["style", "class", "id", "title", "dir", "lang"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      table: ["border", "cellpadding", "cellspacing", "align", "width"],
      td: ["colspan", "rowspan", "align", "valign", "width", "height", "bgcolor"],
      th: ["colspan", "rowspan", "align", "valign", "width", "height", "bgcolor"],
      tr: ["align", "valign", "bgcolor"],
      colgroup: ["span"],
      col: ["span", "width"],
    },
    // Solo permitir protocolos seguros + cid (inline images)
    allowedSchemes: ["http", "https", "mailto", "tel", "cid", "data"],
    allowedSchemesByTag: {
      img: ["cid", "http", "https", "data"],
    },
    // Forzar target=_blank y rel=noopener en links externos
    transformTags: {
      a: (tagName: string, attribs: { [k: string]: string }) => {
        const out: { [k: string]: string } = { ...attribs }
        if (attribs.href && !attribs.href.startsWith("#")) {
          out.target = "_blank"
          out.rel = "noopener noreferrer nofollow"
        }
        return { tagName, attribs: out }
      },
    },
    // Permitir style con whitelist limitado de propiedades CSS comunes en email
    allowedStyles: {
      "*": {
        color: [/^.*$/],
        "background-color": [/^.*$/],
        "text-align": [/^left$|^right$|^center$|^justify$/],
        "font-size": [/^\d+(?:px|em|rem|%)?$/],
        "font-weight": [/^.*$/],
        "font-family": [/^.*$/],
        margin: [/^.*$/],
        padding: [/^.*$/],
        border: [/^.*$/],
        "border-radius": [/^.*$/],
        width: [/^.*$/],
        "max-width": [/^.*$/],
        height: [/^.*$/],
        "line-height": [/^.*$/],
        display: [/^.*$/],
      },
    },
    // Sin classes whitelist explícito
    allowedClasses: {},
    // Strip non-printable chars
    enforceHtmlBoundary: false,
  })
}

/**
 * Extrae el texto plano de un HTML como fallback si body_text está vacío.
 */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return ""
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: (text) => text.replace(/\s+/g, " "),
  }).trim()
}
