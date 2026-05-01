"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils/cn"

interface PageHeaderProps {
  title: string
  description?: React.ReactNode
  /** Usa la tipografía display serif grande para el título */
  display?: boolean
  /** Eyebrow opcional arriba del título (overline) */
  eyebrow?: string
  /** Slot de acciones a la derecha (botones, menús, etc.) */
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

/**
 * PageHeader — legacy compat. Las nuevas páginas usan AppTopbar directo.
 * Mantenemos este componente para no romper pantallas internas.
 * Ahora usa tokens semánticos (dark-mode ready) y entrada animada.
 */
export function PageHeader({
  title,
  description,
  display = false,
  eyebrow,
  actions,
  className,
  children,
}: PageHeaderProps) {
  const right = actions ?? children
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "flex flex-col gap-4 border-b border-border/60 bg-background/80 px-6 py-6 backdrop-blur-sm lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-7",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow && (
          <span className="inline-flex items-center gap-1.5 text-caption font-medium uppercase tracking-[0.14em] text-brand">
            <span
              className="h-1 w-1 rounded-full bg-brand"
              aria-hidden="true"
            />
            {eyebrow}
          </span>
        )}
        {display ? (
          <h1 className="truncate font-display text-display-lg leading-[1.05] text-foreground">
            {title}
          </h1>
        ) : (
          <h1 className="truncate text-h1 font-semibold leading-tight text-foreground">
            {title}
          </h1>
        )}
        {description &&
          (typeof description === "string" ? (
            <p className="text-body text-muted-foreground">{description}</p>
          ) : (
            <div className="text-body text-muted-foreground">{description}</div>
          ))}
      </div>
      {right && (
        <div className="flex flex-shrink-0 items-center gap-2">{right}</div>
      )}
    </motion.div>
  )
}
