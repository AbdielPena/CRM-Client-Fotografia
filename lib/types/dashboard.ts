/**
 * Tipos compartidos del dashboard del monolito (cross-módulo).
 *
 * Estos tipos los consumen los componentes `MetricsGrid`, `ActivityFeed`,
 * `ModuleCard` rescatados desde studio-hub y adaptados a navegación interna.
 *
 * NO depender de tablas DB aquí — son shapes de UI. Las fuentes de datos
 * (services + RPCs) mapean a estos tipos.
 */

/**
 * KPIs del dashboard. Cada campo es el agregado más útil para el usuario.
 * Calculados en `dashboard.service.ts` vía vista materializada o queries.
 */
export interface DashboardMetrics {
  /** Ingresos del mes en curso, suma de fin_transactions.is_income (currency studio default) */
  income_month: number
  /** Gastos del mes en curso, suma de fin_transactions.is_expense */
  expenses_month: number
  /** income_month - expenses_month */
  net_balance: number
  /** Conteo de invoices con status PENDING/OVERDUE */
  invoices_pending: number
  /** Conteo de payments del mes (independiente del status del invoice) */
  payments_received: number
  /** Conteo de clients creados en el mes */
  customers_new_month: number
  /** Conteo de bookings/projects con event_date en los próximos 14 días */
  upcoming_bookings: number
  /** Conteo de inv_items por debajo del threshold de low_stock (F3) */
  low_stock_items: number
}

/**
 * Item del activity feed unificado: combina actividad cross-módulo.
 *
 * `source` indica el sub-dominio que originó el evento. En el monolito todo
 * vive en la misma DB, pero seguimos etiquetando por módulo para UI clara.
 */
export interface ActivityItem {
  id: string
  /** Fuente: 'crm' | 'finance' | 'inventory' | 'mail' | 'gallery' | etc. */
  source: ActivitySource
  /** Tipo del evento: 'invoice.paid', 'client.created', 'inv_loan.returned', etc. */
  type: string
  /** Título legible: "Factura pagada", "Cliente nuevo registrado" */
  title: string
  /** Descripción opcional con detalle */
  description?: string
  /** ISO timestamp (UTC) — render como relativeTime() */
  at: string
  /** Entity referenciado (opcional) — para deep-link */
  entityType?: string
  entityId?: string
  /** Actor que generó el evento (user_id) */
  actorId?: string
}

export type ActivitySource =
  | "crm"
  | "finance"
  | "inventory"
  | "fiscal"
  | "mail"
  | "gallery"
  | "contract"
  | "booking"
  | "system"

/**
 * Definición de un módulo del monolito para el dashboard navegacional.
 * Mapea a las secciones del sidebar y `ModuleCard`s en el dashboard.
 */
export interface ModuleDefinition {
  /** Slug del módulo, usado en URLs internas (`/<id>`) */
  id: string
  /** Display name */
  name: string
  /** Texto explicativo corto */
  description: string
  /** Color del badge/glow del módulo */
  color: string
  /** Lucide icon name */
  iconName: string
  /** Path interno de navegación */
  href: string
  /** Acciones rápidas del módulo */
  quickActions: Array<{ label: string; href: string }>
  /** Si está habilitado en este studio */
  enabled: boolean
}
