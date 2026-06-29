export function formatCurrency(amount: number, currency = "USD", locale = "es-MX") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

// Una fecha "solo día" (YYYY-MM-DD) viene sin hora; new Date() la interpreta
// como medianoche UTC y en husos negativos (RD = UTC-4) retrocede un día al
// mostrarla. Para esas fechas formateamos en UTC y así se ve el día correcto.
// (Los timestamps con hora se siguen mostrando en hora local.)
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parsea una fecha "solo día" como fecha LOCAL (no UTC), evitando el corrimiento
 * de un día. Útil cuando luego se formatea con `.toLocaleDateString()`. Para
 * timestamps con hora, devuelve `new Date(value)` normal.
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (!m) return new Date(value)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function formatDate(date: Date | string | null, locale = "es-MX") {
  if (!date) return "—"
  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }
  if (typeof date === "string" && DATE_ONLY.test(date)) opts.timeZone = "UTC"
  return new Intl.DateTimeFormat(locale, opts).format(new Date(date))
}

export function formatDateShort(date: Date | string | null, locale = "es-MX") {
  if (!date) return "—"
  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }
  if (typeof date === "string" && DATE_ONLY.test(date)) opts.timeZone = "UTC"
  return new Intl.DateTimeFormat(locale, opts).format(new Date(date))
}

/**
 * Format a plain number with locale-aware thousands separators.
 * Useful for KPIs in MetricsGrid (count of clients, invoices, etc.).
 */
export function formatNumber(value: number | null | undefined, locale = "es-MX") {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return new Intl.NumberFormat(locale).format(value)
}

/**
 * Human-readable relative time ("hace 3 min", "hace 2 d"). For activity feeds.
 * Usa Intl.RelativeTimeFormat (nativo). Acepta Date | ISO string | epoch ms.
 */
export function relativeTime(input: Date | string | number, locale = "es-MX"): string {
  const now = Date.now()
  const t = typeof input === "number" ? input : new Date(input).getTime()
  if (Number.isNaN(t)) return "—"
  const diffSec = Math.round((t - now) / 1000)
  const abs = Math.abs(diffSec)

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" })
  if (abs < 60) return rtf.format(diffSec, "second")
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute")
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour")
  if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), "day")
  if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), "month")
  return rtf.format(Math.round(diffSec / 31536000), "year")
}
