import type { TriggerType, BlockType } from "@/server/services/engagement.service"

/**
 * Presets de Fase 1 del Client Engagement Hub: automatizaciones listas para
 * activar con 1 clic. Cada una usa una plantilla editable en
 * /settings/emails/templates. Módulo plano (sin server-only) para que lo
 * importen tanto la server action como el componente cliente.
 */
export interface EngagementPreset {
  key: string
  emoji: string
  name: string
  description: string
  triggerType: TriggerType
  triggerConfig: Record<string, unknown>
  steps: Array<{ block_type: BlockType; config: Record<string, unknown> }>
}

export const ENGAGEMENT_PRESETS: Record<string, EngagementPreset> = {
  birthday_day: {
    key: "birthday_day",
    emoji: "🎉",
    name: "Felicitación de cumpleaños (el día)",
    description: "Envía un correo el día del cumpleaños del cliente.",
    triggerType: "date_birthday",
    triggerConfig: { offset_days: 0, offset_dir: "on", birthday_repeat_yearly: true },
    steps: [{ block_type: "send_email", config: { template_slug: "engagement_birthday_greeting" } }],
  },
  birthday_soon: {
    key: "birthday_soon",
    emoji: "🎂",
    name: "Aviso de cumpleaños (7 días antes)",
    description: "Saluda al cliente una semana antes de su cumpleaños.",
    triggerType: "date_birthday",
    triggerConfig: { offset_days: 7, offset_dir: "before", birthday_repeat_yearly: true },
    steps: [{ block_type: "send_email", config: { template_slug: "engagement_birthday_soon" } }],
  },
  post_delivery_feedback: {
    key: "post_delivery_feedback",
    emoji: "⭐",
    name: "Feedback post-entrega",
    description: "Al publicar la entrega final, agradece y pide feedback al cliente.",
    triggerType: "date_final_delivery",
    triggerConfig: {},
    steps: [{ block_type: "send_email", config: { template_slug: "engagement_post_delivery" } }],
  },
  post_delivery_review: {
    key: "post_delivery_review",
    emoji: "🌟",
    name: "Reseña 7 días tras la entrega",
    description: "Espera 7 días tras la entrega final y pide una reseña.",
    triggerType: "date_final_delivery",
    triggerConfig: {},
    steps: [
      { block_type: "wait", config: { wait_days: 7 } },
      { block_type: "send_email", config: { template_slug: "engagement_review_request" } },
    ],
  },
  reengage_6m: {
    key: "reengage_6m",
    emoji: "💌",
    name: "Reactivación a 6 meses de inactividad",
    description: "Reconecta con clientes que no reservan hace 6 meses.",
    triggerType: "date_inactivity",
    triggerConfig: { inactivity_months: 6 },
    steps: [{ block_type: "send_email", config: { template_slug: "engagement_reengagement" } }],
  },
  reengage_1y: {
    key: "reengage_1y",
    emoji: "💌",
    name: "Reactivación a 1 año de inactividad",
    description: "Reconecta con clientes que no reservan hace 1 año.",
    triggerType: "date_inactivity",
    triggerConfig: { inactivity_months: 12 },
    steps: [{ block_type: "send_email", config: { template_slug: "engagement_reengagement" } }],
  },
}

export const ENGAGEMENT_PRESET_LIST: EngagementPreset[] = Object.values(ENGAGEMENT_PRESETS)

export const TRIGGER_LABELS: Record<string, string> = {
  date_birthday: "Cumpleaños",
  date_inactivity: "Inactividad",
  date_final_delivery: "Entrega final",
  date_project_completed: "Proyecto completado",
  event_immediate: "Evento",
  manual: "Manual",
}
