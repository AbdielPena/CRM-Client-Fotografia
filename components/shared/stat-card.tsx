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

/** Tintes pastel por categoría (estilo minimalista SnowUI). */
const TONE_BG: Record<StatTone, string> = {
  blue: "bg-[#E6EEFB] dark:bg-[#1b2336]",
  indigo: "bg-[#E9EAFB] dark:bg-[#20223a]",
  fuchsia: "bg-[#FBEAF4] dark:bg-[#331f2c]",
  violet: "bg-[#EFEAF8] dark:bg-[#262036]",
  emerald: "bg-[#E8F5EE] dark:bg-[#16271f]",
  amber: "bg-[#F4F0E6] dark:bg-[#2b271c]",
  rose: "bg-[#FBEAF1] dark:bg-[#311e27]",
}

/**
 * StatCard — minimalista: tarjeta compacta. Con `tone` toma un fondo pastel
 * (estilo SnowUI); sin tone queda blanca con borde fino.
 */
export function StatCard({
  title,
  value,
  subtitle,
  trend,
  tone,
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
            "group relative block rounded-2xl px-5 py-4 transition-all duration-fast hover:-translate-y-0.5",
            tone
              ? cn(TONE_BG[tone], "border border-transparent hover:shadow-sm")
              : "border border-border bg-card hover:border-border-strong hover:shadow-sm",
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
        "group relative rounded-2xl px-5 py-4 transition-colors duration-fast",
        tone
          ? cn(TONE_BG[tone], "border border-transparent")
          : "border border-border bg-card hover:border-border-strong",
        className,
      )}
    >
      {cardInner}
    </motion.div>
  )
}
