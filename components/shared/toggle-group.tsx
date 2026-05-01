"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils/cn"

export type ToggleOption = {
  key: string
  label: string
  icon?: React.ReactNode
  /** Si se provee un href, renderiza como <Link>. Si no, expone onSelect. */
  href?: string
  /** Tooltip / aria-label opcional. */
  title?: string
}

interface ToggleGroupProps {
  options: ToggleOption[]
  current: string
  onSelect?: (key: string) => void
  /** Solo mostrar los iconos (más compacto). */
  iconOnly?: boolean
  className?: string
}

/**
 * Toggle group — alterna entre N opciones. Si cada opción tiene `href`, es
 * navegación por URL; si no, dispara `onSelect`. Usa un indicador animado
 * compartido (layoutId) como el de FilterChips.
 */
export function ToggleGroup({
  options,
  current,
  onSelect,
  iconOnly = false,
  className,
}: ToggleGroupProps) {
  const layoutId = React.useId()

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-1",
        className,
      )}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.key === current
        const content = (
          <>
            {active && (
              <motion.span
                layoutId={`toggle-active-${layoutId}`}
                className="absolute inset-0 rounded bg-background shadow-xs"
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {opt.icon}
              {!iconOnly && <span>{opt.label}</span>}
            </span>
          </>
        )

        const className = cn(
          "relative inline-flex items-center justify-center rounded px-2 py-1 text-caption font-semibold transition-colors duration-fast",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
          iconOnly ? "h-7 w-7" : "h-7",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )

        if (opt.href) {
          return (
            <Link
              key={opt.key}
              href={opt.href}
              aria-label={opt.title ?? opt.label}
              aria-selected={active}
              role="tab"
              className={className}
            >
              {content}
            </Link>
          )
        }

        return (
          <button
            key={opt.key}
            type="button"
            aria-label={opt.title ?? opt.label}
            aria-selected={active}
            role="tab"
            onClick={() => onSelect?.(opt.key)}
            className={className}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
