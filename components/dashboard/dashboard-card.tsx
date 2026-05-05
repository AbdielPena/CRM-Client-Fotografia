"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils/cn"

interface DashboardCardProps {
  title: string
  /** Compatible con la API anterior — ignorado en Lumen. */
  icon?: React.ReactNode
  href?: string
  hrefLabel?: string
  /** Acciones custom a la derecha del header (botones, dots, etc.) */
  action?: React.ReactNode
  delay?: number
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

/**
 * DashboardCard — variante "Lumen": card off-white, header limpio sin icon-bg,
 * separador inferior sutil, padding aireado.
 */
export function DashboardCard({
  title,
  href,
  hrefLabel = "Ver todos",
  action,
  delay = 0,
  className,
  bodyClassName,
  children,
}: DashboardCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, delay, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card",
        "transition-colors duration-fast hover:border-border-strong",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold text-foreground tracking-tight">
          {title}
        </h2>
        {action ?? (
          href ? (
            <Link
              href={href}
              className="text-[12.5px] font-medium text-brand hover:underline transition-colors"
            >
              {hrefLabel}
            </Link>
          ) : null
        )}
      </header>

      <div className={cn("px-5 pb-5", bodyClassName)}>{children}</div>
    </motion.section>
  )
}
