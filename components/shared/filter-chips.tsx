"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils/cn"

export type FilterChip = {
  key: string
  label: string
  count?: number
}

interface FilterChipsProps {
  /** Href base — se le anexará `?${paramName}=${key}` al hacer click. */
  baseHref: string
  /** Query param que controla el filtro (default "status"). */
  paramName?: string
  /** Valor actualmente seleccionado (null/undefined = "todos"). */
  current?: string | null
  /** Chips disponibles. */
  chips: FilterChip[]
  /** Label para el chip "todos" (default "Todos"). */
  allLabel?: string
  /** Query adicional a preservar en el href. */
  preserveQuery?: Record<string, string | undefined>
  className?: string
}

/**
 * Pills de filtro con shared layout animation (layoutId indicator) para el
 * chip activo. Preserva otros query params al navegar.
 */
export function FilterChips({
  baseHref,
  paramName = "status",
  current,
  chips,
  allLabel = "Todos",
  preserveQuery = {},
  className,
}: FilterChipsProps) {
  const layoutId = React.useId()

  const buildHref = (value?: string) => {
    const params = new URLSearchParams()
    Object.entries(preserveQuery).forEach(([k, v]) => {
      if (v) params.set(k, v)
    })
    if (value) params.set(paramName, value)
    const qs = params.toString()
    return qs ? `${baseHref}?${qs}` : baseHref
  }

  const items: (FilterChip & { active: boolean })[] = [
    { key: "", label: allLabel, active: !current },
    ...chips.map((c) => ({ ...c, active: current === c.key })),
  ]

  return (
    <div
      className={cn(
        "flex items-center gap-1 overflow-x-auto scrollbar-none",
        className,
      )}
    >
      {items.map((item) => (
        <Link
          key={item.key || "__all"}
          href={buildHref(item.key || undefined)}
          className={cn(
            "relative whitespace-nowrap rounded-full px-3 py-1.5 text-caption font-semibold transition-colors duration-fast",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
            item.active
              ? "text-brand-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {item.active && (
            <motion.span
              layoutId={`filter-active-${layoutId}`}
              className="absolute inset-0 rounded-full bg-aurora shadow-glow"
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 35,
              }}
            />
          )}
          <span className="relative flex items-center gap-1.5">
            {item.label}
            {typeof item.count === "number" && (
              <span
                className={cn(
                  "inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] tabular-nums",
                  item.active
                    ? "bg-card/20 text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {item.count}
              </span>
            )}
          </span>
        </Link>
      ))}
    </div>
  )
}
