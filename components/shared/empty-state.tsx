"use client"

import * as React from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils/cn"

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  /** Usa un fondo con aurora sutil (para primer-estados vacíos) */
  accent?: boolean
  className?: string
  children?: React.ReactNode
}

/**
 * Empty state unificado — icono contenido en bubble, título + descripción + CTA.
 * Dark-mode ready, animación de entrada.
 */
export function EmptyState({
  icon,
  title,
  description,
  accent = false,
  className,
  children,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            "relative flex h-14 w-14 items-center justify-center rounded-2xl",
            accent
              ? "bg-aurora-soft text-brand"
              : "bg-muted text-muted-foreground",
          )}
        >
          {accent && (
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-2xl bg-aurora opacity-[0.08] blur-lg"
            />
          )}
          {icon}
        </div>
      )}
      <div className="max-w-sm space-y-1">
        <p className="text-body font-semibold text-foreground">{title}</p>
        {description && (
          <p className="text-body-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="mt-2 flex items-center gap-2">{children}</div>}
    </motion.div>
  )
}
