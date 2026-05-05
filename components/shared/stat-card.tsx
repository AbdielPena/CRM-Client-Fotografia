"use client"

import * as React from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils/cn"

export type StatTone =
  | "violet"
  | "indigo"
  | "fuchsia"
  | "emerald"
  | "amber"
  | "rose"
  | "blue"

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  /** Acepta el ícono pero no se renderiza en el layout Lumen actual. */
  icon?: React.ReactNode
  trend?: { value: number; label?: string }
  /** Mantenido por compatibilidad — no afecta el rendering en Lumen. */
  tone?: StatTone
  /** Mantenido por compatibilidad — no afecta el rendering en Lumen. */
  accent?: boolean
  delay?: number
  className?: string
}

/**
 * StatCard — variante "Lumen": layout compacto horizontal, off-white,
 * sin íconos, sin sombras. Trend pill muy pequeño al lado del valor.
 */
export function StatCard({
  title,
  value,
  subtitle,
  trend,
  delay = 0,
  className,
}: StatCardProps) {
  const trendDir =
    trend === undefined
      ? null
      : trend.value > 0
        ? "up"
        : trend.value < 0
          ? "down"
          : "flat"

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "group relative rounded-xl border border-border bg-card px-5 py-4",
        "transition-colors duration-fast hover:border-border-strong",
        className,
      )}
    >
      <p className="text-[12.5px] font-medium text-muted-foreground">
        {title}
      </p>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[26px] font-bold leading-none tracking-tight tabular-nums text-foreground">
          {value}
        </span>

        {trend ? (
          <span
            className={cn(
              "text-[12px] font-semibold tabular-nums",
              trendDir === "up" && "text-emerald-600 dark:text-emerald-400",
              trendDir === "down" && "text-rose-600 dark:text-rose-400",
              trendDir === "flat" && "text-muted-foreground",
            )}
          >
            {trendDir === "up" ? "+" : trendDir === "down" ? "" : ""}
            {trend.value}%
          </span>
        ) : subtitle ? (
          <span className="text-[12px] text-muted-foreground">{subtitle}</span>
        ) : null}
      </div>

      {trend?.label && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">{trend.label}</p>
      )}
    </motion.div>
  )
}
