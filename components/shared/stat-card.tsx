"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react"

import { cn } from "@/lib/utils/cn"

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: React.ReactNode
  trend?: { value: number; label: string }
  /** Resalta la card con gradiente brand (métrica principal). */
  accent?: boolean
  delay?: number
  className?: string
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  accent = false,
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-6 transition-all duration-200",
        accent
          ? "border-brand/25 bg-gradient-to-br from-brand/10 via-card to-card shadow-md"
          : "border-border bg-card shadow-xs hover:border-border-strong hover:shadow-sm",
        className,
      )}
    >
      {/* top shine for accent */}
      {accent && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent"
        />
      )}

      {/* Icon top-right */}
      {icon && (
        <div
          className={cn(
            "absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-xl",
            accent
              ? "bg-brand/15 text-brand"
              : "bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </div>
      )}

      {/* Label */}
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>

      {/* Value — grande, bold, sans-serif */}
      <p
        className={cn(
          "mt-2 text-4xl font-bold leading-none tracking-tight tabular-nums",
          accent ? "text-brand" : "text-foreground",
        )}
      >
        {value}
      </p>

      {/* Subtitle */}
      {subtitle && (
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      )}

      {/* Trend badge */}
      {trend && (
        <div className="mt-3 flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
              trendDir === "up" && "bg-success-soft text-success",
              trendDir === "down" && "bg-danger-soft text-danger",
              trendDir === "flat" && "bg-muted text-muted-foreground",
            )}
          >
            {trendDir === "up" && <ArrowUpRight className="h-3 w-3" />}
            {trendDir === "down" && <ArrowDownRight className="h-3 w-3" />}
            {trendDir === "flat" && <Minus className="h-3 w-3" />}
            {Math.abs(trend.value)}%
          </span>
          <span className="text-xs text-muted-foreground">{trend.label}</span>
        </div>
      )}
    </motion.div>
  )
}
