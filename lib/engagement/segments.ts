/**
 * Segmentos del Client Engagement Hub (Fase 1.5). Se calculan AL VUELO desde
 * projects/payments/clients (sin tabla cache; suficiente para el volumen de un
 * estudio). Umbrales configurables más adelante (engagement_config).
 */
export interface EngagementSegment {
  key: string
  label: string
  emoji: string
  description: string
}

export const SEGMENT_LIST: EngagementSegment[] = [
  { key: "quinceaneras", label: "Quinceañeras", emoji: "👑", description: "Clientas con proyecto de quinceañera (XV)." },
  { key: "bodas", label: "Bodas", emoji: "💍", description: "Clientes con proyecto de boda." },
  { key: "eventos", label: "Eventos", emoji: "🎉", description: "Clientes con proyecto de evento." },
  { key: "vip", label: "VIP", emoji: "⭐", description: "Clientes con mayor gasto acumulado." },
  { key: "antiguos", label: "Antiguos", emoji: "🕰️", description: "Clientes registrados hace más de 1 año." },
  { key: "inactive_6m", label: "Inactivos 6m+", emoji: "💤", description: "Sin reservar hace 6 meses o más." },
  { key: "birthday_soon", label: "Cumpleaños próximos", emoji: "🎂", description: "Cumplen en los próximos 14 días." },
]

export const SEGMENT_BY_KEY: Record<string, EngagementSegment> = Object.fromEntries(
  SEGMENT_LIST.map((s) => [s.key, s]),
)

/** Umbrales por defecto (DOP / días). Configurables en una iteración futura. */
export const SEGMENT_DEFAULTS = {
  vipMinPaid: 25000,
  inactiveMonths: 6,
  oldClientMonths: 12,
  birthdayWindowDays: 14,
}
