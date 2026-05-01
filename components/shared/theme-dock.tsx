"use client"

/**
 * ThemeDock — selector Light / Dark / System con animación de transición circular.
 * Variantes:
 *  - "full"    : dock completo con 3 botones y etiquetas (para settings, footer).
 *  - "compact" : 3 botones icon-only (ideal para top bar y sidebar footer).
 *  - "toggle"  : botón único que alterna light/dark (ideal para headers densos).
 */

import * as React from "react"
import { Sun, Moon, Monitor } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils/cn"
import { useTheme, type Theme } from "./theme-provider"

interface ThemeDockProps {
  variant?: "full" | "compact" | "toggle"
  className?: string
}

export function ThemeDock({ variant = "compact", className }: ThemeDockProps) {
  const { theme, resolvedTheme, setTheme, toggle } = useTheme()

  // Single-button toggle
  if (variant === "toggle") {
    return (
      <button
        type="button"
        aria-label={`Cambiar a modo ${resolvedTheme === "dark" ? "claro" : "oscuro"}`}
        onClick={(e) => toggle({ x: e.clientX, y: e.clientY })}
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-md",
          "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
          "border border-transparent hover:border-border-strong",
          "transition-all duration-base ease-standard",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
          className,
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {resolvedTheme === "dark" ? (
            <motion.span
              key="moon"
              initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Moon className="h-[18px] w-[18px]" />
            </motion.span>
          ) : (
            <motion.span
              key="sun"
              initial={{ rotate: 90, opacity: 0, scale: 0.6 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: -90, opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Sun className="h-[18px] w-[18px]" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    )
  }

  const options: {
    value: Theme
    label: string
    icon: React.ReactNode
  }[] = [
    { value: "light", label: "Claro", icon: <Sun className="h-4 w-4" /> },
    { value: "dark", label: "Oscuro", icon: <Moon className="h-4 w-4" /> },
    { value: "system", label: "Sistema", icon: <Monitor className="h-4 w-4" /> },
  ]

  // Segmented dock (compact or full)
  return (
    <div
      role="radiogroup"
      aria-label="Tema de la interfaz"
      className={cn(
        "relative inline-flex rounded-md border border-border bg-muted/40 p-0.5",
        "sf-glass shadow-xs",
        className,
      )}
    >
      {options.map((opt) => {
        const isActive = theme === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={opt.label}
            onClick={(e) => setTheme(opt.value, { x: e.clientX, y: e.clientY })}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5",
              "text-caption font-medium",
              "transition-colors duration-base ease-standard",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="theme-dock-indicator"
                className={cn(
                  "absolute inset-0 rounded-[7px]",
                  "bg-card shadow-sm border border-border",
                )}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {opt.icon}
              {variant === "full" && <span>{opt.label}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
