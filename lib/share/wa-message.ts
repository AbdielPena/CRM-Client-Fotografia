// Mensaje de WhatsApp para compartir la galería de SELECCIÓN. Fuente única:
// se edita en Ajustes → WhatsApp y se usa en todos lados (endpoint del desktop,
// pestaña Compartir de la galería, caja copiable). Variables: {{cliente}},
// {{galeria}}, {{link}}.

export const DEFAULT_SELECTION_WA_MESSAGE =
  '¡Hola {{cliente}}! 💛 Tu galería "{{galeria}}" ya está lista para que elijas tus fotos favoritas con el corazón ♥: {{link}}'

export type WaMessageVars = {
  cliente?: string | null
  galeria?: string | null
  link?: string | null
}

/** Reemplaza las variables del template. Tolera vacíos (limpia dobles espacios). */
export function renderWaMessage(template: string | null | undefined, vars: WaMessageVars): string {
  return (template?.trim() || DEFAULT_SELECTION_WA_MESSAGE)
    .replace(/\{\{\s*cliente\s*\}\}/gi, (vars.cliente ?? "").trim())
    .replace(/\{\{\s*galeria\s*\}\}/gi, (vars.galeria ?? "").trim())
    .replace(/\{\{\s*link\s*\}\}/gi, (vars.link ?? "").trim())
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

/** Primer nombre (para un saludo más cálido). */
export function firstNameOf(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? ""
}
