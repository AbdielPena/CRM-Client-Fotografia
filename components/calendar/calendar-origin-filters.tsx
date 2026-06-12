import Link from "next/link"
import {
  CalendarRange,
  Sparkles,
  CalendarCheck,
  UserCheck,
  CalendarDays,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import type { CalendarOriginFilter } from "@/server/services/google-calendar.service"

const FILTERS: Array<{
  key: CalendarOriginFilter
  label: string
  icon: React.ElementType
  badgeColor: string
}> = [
  {
    key: "all",
    label: "Todos",
    icon: CalendarRange,
    badgeColor: "bg-muted text-foreground",
  },
  {
    key: "studioflow",
    label: "PixelOS",
    icon: Sparkles,
    badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  },
  {
    key: "google_calendar",
    label: "Google Calendar",
    icon: CalendarCheck,
    badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  {
    key: "with_client",
    label: "Con cliente",
    icon: UserCheck,
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  {
    key: "external",
    label: "Personales",
    icon: CalendarDays,
    badgeColor: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  },
]

interface Props {
  active: CalendarOriginFilter
  counts: Record<CalendarOriginFilter, number>
  year: number
  month: number
}

/**
 * Filter chips para el calendar — segmentado por origen del evento.
 * Conserva el mes/año actual al cambiar filtro.
 */
export function CalendarOriginFilters({ active, counts, year, month }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTERS.map((f) => {
        const Icon = f.icon
        const count = counts[f.key]
        const isActive = active === f.key
        return (
          <Link
            key={f.key}
            href={`/calendar?month=${month}&year=${year}&origin=${f.key}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
              isActive
                ? "border-brand bg-brand text-brand-foreground shadow-sm"
                : "border-border bg-card text-foreground hover:bg-muted/40",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{f.label}</span>
            <span
              className={cn(
                "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                isActive ? "bg-brand-foreground/20" : f.badgeColor,
              )}
            >
              {count}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
