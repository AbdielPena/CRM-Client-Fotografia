"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils/cn"

interface DashboardCardProps {
  title: string
  icon?: React.ReactNode
  href?: string
  hrefLabel?: string
  action?: React.ReactNode
  delay?: number
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

export function DashboardCard({
  title,
  icon,
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs",
        "transition-shadow duration-200 hover:shadow-sm",
        className,
      )}
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && (
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
              {icon}
            </span>
          )}
          <h2 className="truncate text-sm font-semibold text-foreground">
            {title}
          </h2>
        </div>
        {action ?? (
          href ? (
            <Link
              href={href}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {hrefLabel}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null
        )}
      </header>

      {/* Body */}
      <div className={cn("px-6 py-5", bodyClassName)}>{children}</div>
    </motion.section>
  )
}
