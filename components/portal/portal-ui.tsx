import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/** Encabezado premium consistente para todas las vistas del portal. */
export function PortalHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string
  title: string
  description?: string
  right?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 animate-fade-in-up">
      <div className="min-w-0">
        {eyebrow && <p className="lx-overline mb-2">{eyebrow}</p>}
        <h1 className="font-serif text-3xl font-semibold text-foreground sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {right}
    </header>
  )
}

/** Estado vacío premium (un solo patrón para todo el portal). */
export function PortalEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description?: string
}) {
  return (
    <div className="lx-card flex flex-col items-center px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-gold-600">
        <Icon className="h-6 w-6" />
      </span>
      <p className="font-serif text-lg font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  )
}

/** Resumen destacado (ej. total pendiente / pagado). */
export function PortalSummaryPill({
  label,
  value,
  tone = "gold",
}: {
  label: string
  value: string
  tone?: "gold" | "success" | "warning"
}) {
  const tones = {
    gold: "bg-brand-soft text-gold-700",
    success:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    warning:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  }
  return (
    <div className={`rounded-2xl px-5 py-3 text-right ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">
        {label}
      </p>
      <p className="mt-0.5 font-serif-soft text-2xl font-semibold tabular-nums">
        {value}
      </p>
    </div>
  )
}
