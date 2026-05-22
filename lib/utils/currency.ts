export function formatCurrency(amount: number, currency = "USD", locale = "es-MX") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: Date | string | null, locale = "es-MX") {
  if (!date) return "—"
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(date))
}

export function formatDateShort(date: Date | string | null, locale = "es-MX") {
  if (!date) return "—"
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date))
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
