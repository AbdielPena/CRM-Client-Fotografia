/**
 * Convierte el HTML de una plantilla de email a texto plano apto para WhatsApp.
 * WhatsApp soporta *negrita*, _cursiva_, ~tachado~ y saltos de línea — nada de
 * HTML. Conserva las variables {{var}} para que el usuario las mapee a {{1}},{{2}}
 * al crear la plantilla aprobada en Meta.
 */
export function htmlToWhatsAppText(html: string): string {
  let t = html || ""

  // Negrita / cursiva → marcado de WhatsApp
  t = t.replace(/<\s*(strong|b)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, "*$2*")
  t = t.replace(/<\s*(em|i)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, "_$2_")

  // Enlaces: <a href="X">Y</a> → "Y (X)" (o solo X si no hay texto)
  t = t.replace(
    /<\s*a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi,
    (_m, href: string, text: string) => {
      const label = text.replace(/<[^>]+>/g, "").trim()
      return label && label !== href ? `${label} (${href})` : href
    },
  )

  // Saltos de línea y bloques
  t = t.replace(/<\s*br\s*\/?\s*>/gi, "\n")
  t = t.replace(/<\s*li\s*>/gi, "• ")
  t = t.replace(/<\s*\/\s*(p|div|h[1-6]|li|tr|ul|ol)\s*>/gi, "\n")

  // Quitar el resto de etiquetas
  t = t.replace(/<[^>]+>/g, "")

  // Decodificar entidades comunes
  t = t
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")

  // Normalizar espacios y saltos
  t = t
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return t
}
