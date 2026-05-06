"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowUpRight } from "lucide-react"

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
  /** Si se pasa, la card se vuelve clickable y navega ahí. */
  href?: string
  /** Tooltip al hover sobre la card (HTML title). */
  tooltip?: string
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
  href,
  tooltip,
}: StatCardProps) {
  const trendDir =
    trend === undefined
      ? null
      : trend.value > 0
        ? "up"
        : trend.value < 0
          ? "down"
          : "flat"

  const cardInner = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-[12.5px] font-medium text-muted-foreground">{title}</p>
        {href && (
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity duration-fast group-hover:opacity-100" />
        )}
      </div>

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
    </>
  )

  const motionProps = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.32, delay, ease: [0.32, 0.72, 0, 1] as const },
  }

  if (href) {
    return (
      <motion.div {...motionProps}>
        <Link
          href={href}
          title={tooltip}
          className={cn(
            "group relative block rounded-xl border border-border bg-card px-5 py-4",
            "transition-all duration-fast hover:border-brand/40 hover:shadow-sm hover:-translate-y-0.5",
            className,
          )}
        >
          {cardInner}
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.div
      {...motionProps}
      title={tooltip}
      className={cn(
        "group relative rounded-xl border border-border bg-card px-5 py-4",
        "transition-colors duration-fast hover:border-border-strong",
        className,
      )}
    >
      {cardInner}
    </motion.div>
  )
}
