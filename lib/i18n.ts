/**
 * Sistema de internacionalización (i18n) ligero sin dependencias externas.
 *
 * Soporta:
 *   - 4 locales: es-DO (default), es-MX, es-ES, en-US, pt-BR
 *   - Plurales via Intl.PluralRules
 *   - Interpolación {{var}}
 *   - Locale detectado por studio_branding.locale o por cookie ?locale=
 *
 * Uso server:
 *   const t = await getTranslations(studioId)
 *   t("dashboard.welcome", { name: "Abby" })
 *
 * Uso client: usar el hook useTranslations del LocaleProvider (V2).
 */

import { cookies } from "next/headers"

export const SUPPORTED_LOCALES = [
  "es-DO",
  "es-MX",
  "es-ES",
  "en-US",
  "pt-BR",
] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "es-DO"

// Dictionaries inline (V1). En V2: cargar JSON files dinamicamente.
const DICTIONARIES: Record<Locale, Record<string, string>> = {
  "es-DO": {
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.delete": "Eliminar",
    "common.edit": "Editar",
    "common.loading": "Cargando...",
    "common.search": "Buscar",
    "common.create": "Crear",
    "common.update": "Actualizar",
    "common.back": "Volver",
    "common.next": "Siguiente",
    "common.yes": "Sí",
    "common.no": "No",
    "dashboard.welcome": "Hola, {{name}} 👋",
    "dashboard.title": "Dashboard",
    "clients.title": "Clientes",
    "clients.new": "Nuevo cliente",
    "clients.count": "{{count}} clientes",
    "projects.title": "Proyectos",
    "projects.new": "Nuevo proyecto",
    "invoices.title": "Facturas",
    "invoices.new": "Nueva factura",
    "tasks.title": "Tareas",
    "tasks.new": "Nueva tarea",
    "tasks.pending": "Pendientes",
    "tasks.overdue": "Atrasadas",
    "chat.title": "Chat interno",
    "settings.title": "Configuración",
    "settings.branding": "Marca y personalización",
    "settings.billing": "Plan y facturación",
    "settings.security": "Seguridad (2FA)",
    "settings.api": "API y tokens",
    "settings.webhooks": "Webhooks salientes",
    "reports.title": "Reportes",
    "automations.title": "Automatizaciones",
    "onboarding.title": "Onboarding",
  },
  "es-MX": {
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.delete": "Eliminar",
    "common.edit": "Editar",
    "common.loading": "Cargando...",
    "common.search": "Buscar",
    "common.create": "Crear",
    "common.update": "Actualizar",
    "common.back": "Volver",
    "common.next": "Siguiente",
    "common.yes": "Sí",
    "common.no": "No",
    "dashboard.welcome": "Hola, {{name}} 👋",
    "dashboard.title": "Tablero",
    "clients.title": "Clientes",
    "clients.new": "Nuevo cliente",
    "clients.count": "{{count}} clientes",
    "projects.title": "Proyectos",
    "projects.new": "Nuevo proyecto",
    "invoices.title": "Facturas",
    "invoices.new": "Nueva factura",
    "tasks.title": "Tareas",
    "tasks.new": "Nueva tarea",
    "tasks.pending": "Pendientes",
    "tasks.overdue": "Atrasadas",
    "chat.title": "Chat interno",
    "settings.title": "Ajustes",
    "settings.branding": "Marca y personalización",
    "settings.billing": "Plan y facturación",
    "settings.security": "Seguridad (2FA)",
    "settings.api": "API y tokens",
    "settings.webhooks": "Webhooks salientes",
    "reports.title": "Reportes",
    "automations.title": "Automatizaciones",
    "onboarding.title": "Onboarding",
  },
  "es-ES": {
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.delete": "Eliminar",
    "common.edit": "Editar",
    "common.loading": "Cargando...",
    "common.search": "Buscar",
    "common.create": "Crear",
    "common.update": "Actualizar",
    "common.back": "Atrás",
    "common.next": "Siguiente",
    "common.yes": "Sí",
    "common.no": "No",
    "dashboard.welcome": "Hola, {{name}} 👋",
    "dashboard.title": "Panel",
    "clients.title": "Clientes",
    "clients.new": "Nuevo cliente",
    "clients.count": "{{count}} clientes",
    "projects.title": "Proyectos",
    "projects.new": "Nuevo proyecto",
    "invoices.title": "Facturas",
    "invoices.new": "Nueva factura",
    "tasks.title": "Tareas",
    "tasks.new": "Nueva tarea",
    "tasks.pending": "Pendientes",
    "tasks.overdue": "Atrasadas",
    "chat.title": "Chat interno",
    "settings.title": "Ajustes",
    "settings.branding": "Marca y personalización",
    "settings.billing": "Plan y facturación",
    "settings.security": "Seguridad (2FA)",
    "settings.api": "API y tokens",
    "settings.webhooks": "Webhooks salientes",
    "reports.title": "Informes",
    "automations.title": "Automatizaciones",
    "onboarding.title": "Bienvenida",
  },
  "en-US": {
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.loading": "Loading...",
    "common.search": "Search",
    "common.create": "Create",
    "common.update": "Update",
    "common.back": "Back",
    "common.next": "Next",
    "common.yes": "Yes",
    "common.no": "No",
    "dashboard.welcome": "Hi, {{name}} 👋",
    "dashboard.title": "Dashboard",
    "clients.title": "Clients",
    "clients.new": "New client",
    "clients.count": "{{count}} clients",
    "projects.title": "Projects",
    "projects.new": "New project",
    "invoices.title": "Invoices",
    "invoices.new": "New invoice",
    "tasks.title": "Tasks",
    "tasks.new": "New task",
    "tasks.pending": "Pending",
    "tasks.overdue": "Overdue",
    "chat.title": "Team chat",
    "settings.title": "Settings",
    "settings.branding": "Branding & customization",
    "settings.billing": "Plan & billing",
    "settings.security": "Security (2FA)",
    "settings.api": "API & tokens",
    "settings.webhooks": "Outbound webhooks",
    "reports.title": "Reports",
    "automations.title": "Automations",
    "onboarding.title": "Onboarding",
  },
  "pt-BR": {
    "common.save": "Salvar",
    "common.cancel": "Cancelar",
    "common.delete": "Excluir",
    "common.edit": "Editar",
    "common.loading": "Carregando...",
    "common.search": "Buscar",
    "common.create": "Criar",
    "common.update": "Atualizar",
    "common.back": "Voltar",
    "common.next": "Próximo",
    "common.yes": "Sim",
    "common.no": "Não",
    "dashboard.welcome": "Olá, {{name}} 👋",
    "dashboard.title": "Painel",
    "clients.title": "Clientes",
    "clients.new": "Novo cliente",
    "clients.count": "{{count}} clientes",
    "projects.title": "Projetos",
    "projects.new": "Novo projeto",
    "invoices.title": "Faturas",
    "invoices.new": "Nova fatura",
    "tasks.title": "Tarefas",
    "tasks.new": "Nova tarefa",
    "tasks.pending": "Pendentes",
    "tasks.overdue": "Atrasadas",
    "chat.title": "Chat interno",
    "settings.title": "Configurações",
    "settings.branding": "Marca e personalização",
    "settings.billing": "Plano e faturamento",
    "settings.security": "Segurança (2FA)",
    "settings.api": "API e tokens",
    "settings.webhooks": "Webhooks de saída",
    "reports.title": "Relatórios",
    "automations.title": "Automações",
    "onboarding.title": "Onboarding",
  },
}

/**
 * Interpola {{var}} en el string con values.
 */
function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = values[key]
    return v !== undefined ? String(v) : `{{${key}}}`
  })
}

/**
 * Función de traducción. Si la key no existe en el locale, fallback a default.
 */
export function createTranslator(locale: Locale) {
  return function t(key: string, values?: Record<string, string | number>): string {
    const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]
    const template =
      dict[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key
    return interpolate(template, values)
  }
}

/**
 * Helper server: detecta locale del studio (branding) o cookie/header,
 * fallback a default.
 */
export async function getCurrentLocale(opts?: {
  studioLocale?: string
}): Promise<Locale> {
  // 1. Studio branding
  if (opts?.studioLocale && isValidLocale(opts.studioLocale)) {
    return opts.studioLocale as Locale
  }

  // 2. Cookie set by user toggle
  try {
    const cookieStore = await cookies()
    const cookieLocale = cookieStore.get("studioflow_locale")?.value
    if (cookieLocale && isValidLocale(cookieLocale)) {
      return cookieLocale as Locale
    }
  } catch {
    // Server components solo
  }

  return DEFAULT_LOCALE
}

function isValidLocale(locale: string): boolean {
  return SUPPORTED_LOCALES.includes(locale as Locale)
}

/**
 * Format numeric/date helpers que respetan el locale.
 */
export function formatNumber(
  value: number,
  locale: Locale = DEFAULT_LOCALE,
  opts?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, opts).format(value)
}

export function formatDateLocalized(
  date: Date,
  locale: Locale = DEFAULT_LOCALE,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(
    locale,
    opts ?? { year: "numeric", month: "short", day: "numeric" },
  ).format(date)
}

export function formatRelativeTime(
  date: Date,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  const diffSec = (date.getTime() - Date.now()) / 1000
  const diffMin = diffSec / 60
  const diffHour = diffMin / 60
  const diffDay = diffHour / 24

  if (Math.abs(diffDay) >= 1) return rtf.format(Math.round(diffDay), "day")
  if (Math.abs(diffHour) >= 1) return rtf.format(Math.round(diffHour), "hour")
  if (Math.abs(diffMin) >= 1) return rtf.format(Math.round(diffMin), "minute")
  return rtf.format(Math.round(diffSec), "second")
}
