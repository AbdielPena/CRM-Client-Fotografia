/**
 * Catálogo de los correos automáticos que el estudio puede regular.
 *
 * Vive en `lib/` (no `server/`) porque la pantalla de ajustes lo necesita en el
 * navegador para dibujar los controles y el texto de cada flujo.
 *
 * Solo entran aquí los correos que se REPITEN o que salen con un plazo. Los
 * que responden a una acción concreta (mandar la factura, publicar la galería)
 * no tienen ritmo que ajustar — para frenar esos está la pausa por cliente.
 */

export const AUTOMATION_KEYS = [
  "print_selection_reminder",
  "session_balance_reminder",
] as const

export type AutomationKey = (typeof AUTOMATION_KEYS)[number]

/** Perillas que aplican a un flujo. No todos usan las tres. */
export type AutomationField = "every_days" | "offset_days" | "max_days"

export interface AutomationConfig {
  enabled: boolean
  every_days: number | null
  offset_days: number | null
  max_days: number | null
}

export interface AutomationDef {
  key: AutomationKey
  label: string
  /** Qué le llega al cliente. */
  what: string
  /** Desde cuándo empieza a contar. */
  when: string
  /** Cuándo se apaga solo, sin que nadie haga nada. */
  stops: string
  fields: AutomationField[]
  defaults: AutomationConfig
}

export const AUTOMATIONS: AutomationDef[] = [
  {
    key: "print_selection_reminder",
    label: "Recordatorio de impresiones",
    what: "Le recuerda al cliente que todavía no ha elegido cuáles fotos quiere impresas.",
    when: "Desde que se le entrega la galería final.",
    stops: "En cuanto envía su selección.",
    fields: ["every_days", "max_days"],
    defaults: {
      enabled: true,
      every_days: 3,
      offset_days: null,
      max_days: 30,
    },
  },
  {
    key: "session_balance_reminder",
    label: "Recordatorio de saldo",
    what: "Le avisa al cliente del 50% que queda por pagar, antes de la sesión y el mismo día.",
    when: "Atado a la fecha de la sesión.",
    stops: "En cuanto la factura queda saldada.",
    fields: ["offset_days"],
    defaults: {
      enabled: true,
      every_days: null,
      offset_days: 1,
      max_days: null,
    },
  },
]

export function automationDef(key: string): AutomationDef | null {
  return AUTOMATIONS.find((a) => a.key === key) ?? null
}

/** Etiqueta de cada perilla, en el idioma del estudio. */
export const FIELD_LABELS: Record<AutomationField, string> = {
  every_days: "Repetir cada",
  offset_days: "Avisar con",
  max_days: "Dejar de insistir a los",
}

export const FIELD_SUFFIX: Record<AutomationField, string> = {
  every_days: "días",
  offset_days: "días de antelación",
  max_days: "días",
}

/**
 * Resumen en una línea de cómo quedó configurado el flujo — lo que se lee
 * arriba de los controles para no tener que interpretar los números.
 */
export function describeAutomation(
  def: AutomationDef,
  cfg: AutomationConfig,
): string {
  if (!cfg.enabled) return "Apagado — no sale ningún correo de este flujo."

  const partes: string[] = []
  if (def.fields.includes("every_days") && cfg.every_days) {
    partes.push(
      cfg.every_days === 1 ? "Todos los días" : `Cada ${cfg.every_days} días`,
    )
  }
  if (def.fields.includes("offset_days") && cfg.offset_days != null) {
    partes.push(
      cfg.offset_days === 0
        ? "El mismo día de la sesión"
        : cfg.offset_days === 1
          ? "Un día antes y el día de la sesión"
          : `${cfg.offset_days} días antes y el día de la sesión`,
    )
  }
  if (def.fields.includes("max_days") && cfg.max_days) {
    partes.push(`hasta ${cfg.max_days} días`)
  }
  return partes.length > 0 ? `${partes.join(", ")}.` : "Encendido."
}
