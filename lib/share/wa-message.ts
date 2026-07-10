// Mensaje de WhatsApp para compartir la galería de SELECCIÓN. Fuente única:
// se edita en Ajustes → WhatsApp y se usa en todos lados (endpoint del desktop,
// pestaña Compartir de la galería, caja copiable). Variables: {{cliente}},
// {{galeria}}, {{link}}.

export const DEFAULT_SELECTION_WA_MESSAGE =
  '¡Hola {{cliente}}! 💛 Tu galería "{{galeria}}" ya está lista para que elijas tus fotos favoritas con el corazón ♥: {{link}}'

// Mensaje de la ENTREGA FINAL (fotos ya editadas). Variables extra:
// {{link_web}} = descarga desde la web (?entrega=1); {{link_drive}} = Google Drive.
export const DEFAULT_DELIVERY_WA_MESSAGE =
  '¡Hola {{cliente}}! 🎉 Tu entrega final de "{{galeria}}" ya está lista. Míralas y descárgalas aquí: {{link_web}} · Y desde Google Drive: {{link_drive}}'

// Mensaje para invitar a elegir IMPRESIONES (marcos / álbum / fotos) desde la
// galería de entrega. Variables: {{cliente}}, {{galeria}}, {{link}}.
export const DEFAULT_PRINT_WA_MESSAGE =
  '¡Hola {{cliente}}! 🖼️ Tus fotos de "{{galeria}}" ya están listas. Ahora puedes elegir tus impresiones incluidas en tu plan (marcos, álbum y fotos) aquí: {{link}}'

// Mensaje para avisar que las IMPRESIONES ya están listas para retirar en el
// estudio. Variables: {{cliente}}, {{galeria}}.
export const DEFAULT_PRINTS_READY_WA_MESSAGE =
  '¡Hola {{cliente}}! 🎉 Tus impresiones de "{{galeria}}" ya están listas para retirar en el estudio. ¡Te esperamos!'

export type WaMessageVars = {
  cliente?: string | null
  galeria?: string | null
  link?: string | null
  /** Entrega final: link de descarga desde la web (?entrega=1). */
  link_web?: string | null
  /** Entrega final: link de la carpeta de Google Drive. */
  link_drive?: string | null
}

/** Reemplaza las variables del template. Tolera vacíos (limpia dobles espacios). */
export function renderWaMessage(template: string | null | undefined, vars: WaMessageVars): string {
  return (template?.trim() || DEFAULT_SELECTION_WA_MESSAGE)
    .replace(/\{\{\s*cliente\s*\}\}/gi, (vars.cliente ?? "").trim())
    .replace(/\{\{\s*galeria\s*\}\}/gi, (vars.galeria ?? "").trim())
    // link_web / link_drive antes que link (no colisionan por el sufijo, pero
    // dejamos el orden explícito por claridad).
    .replace(/\{\{\s*link_web\s*\}\}/gi, (vars.link_web ?? "").trim())
    .replace(/\{\{\s*link_drive\s*\}\}/gi, (vars.link_drive ?? "").trim())
    .replace(/\{\{\s*link\s*\}\}/gi, (vars.link ?? "").trim())
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

/** Primer nombre (para un saludo más cálido). */
export function firstNameOf(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? ""
}
