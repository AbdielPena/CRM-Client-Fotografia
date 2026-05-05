"use client"

import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  Plus,
  Bell,
  UserPlus,
  FolderPlus,
  Receipt,
  FileText,
  Package,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"

interface AppTopbarProps {
  title?: string
  eyebrow?: string
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Compatible con la API anterior — sin efecto en Lumen. */
  display?: boolean
  unreadNotifications?: number
  className?: string
}

const QUICK_ACTIONS = [
  { href: "/leads/new", label: "Nuevo lead", icon: UserPlus },
  { href: "/clients/new", label: "Nuevo cliente", icon: UserPlus },
  { href: "/projects/new", label: "Nuevo proyecto", icon: FolderPlus },
  { href: "/invoices/new", label: "Nueva factura", icon: Receipt },
  { href: "/contracts/new", label: "Nuevo contrato", icon: FileText },
  { href: "/packages/new", label: "Nuevo paquete", icon: Package },
] as const

/**
 * Topbar Lumen — sticky bar muy sutil con search + new + notif.
 * Hero section opcional (title/eyebrow/description/actions) debajo.
 */
export function AppTopbar({
  title,
  eyebrow,
  description,
  actions,
  unreadNotifications = 0,
  className,
}: AppTopbarProps) {
  const [quickOpen, setQuickOpen] = React.useState(false)
  const quickRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!quickOpen) return
    const onDown = (e: MouseEvent) => {
      if (!quickRef.current) return
      if (!quickRef.current.contains(e.target as Node)) setQuickOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQuickOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [quickOpen])

  return (
    <div className={cn("flex flex-col", className)}>
      {/* ========== Sticky control bar — Lumen, alto h-12, sutil ========== */}
      <div className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/85 px-6 backdrop-blur-md lg:px-8">
        {/* Search */}
        <div className="relative max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Buscar..."
            className={cn(
              "h-8 w-full rounded-lg border border-transparent bg-muted/60 pl-8 pr-3 text-[13px] text-foreground",
              "placeholder:text-muted-foreground",
              "transition-colors duration-fast",
              "hover:bg-muted",
              "focus:border-brand/40 focus:bg-background focus:outline-none focus:ring-2 focus:ring-brand/20",
            )}
          />
        </div>

        <div className="ml-auto flex items-center gap-1">
          {/* Quick New */}
          <div className="relative" ref={quickRef}>
            <button
              type="button"
              onClick={() => setQuickOpen((v) => !v)}
              aria-expanded={quickOpen}
              aria-haspopup="menu"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium",
                "bg-brand text-brand-foreground transition-colors duration-fast hover:bg-brand/90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nuevo</span>
            </button>

            <AnimatePresence>
              {quickOpen && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
                  className="absolute right-0 top-[calc(100%+6px)] w-52 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
                >
                  <div className="p-1">
                    {QUICK_ACTIONS.map((a) => {
                      const Icon = a.icon
                      return (
                        <Link
                          key={a.href}
                          href={a.href}
                          role="menuitem"
                          onClick={() => setQuickOpen(false)}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-popover-foreground",
                            "transition-colors hover:bg-muted",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-brand" />
                          <span>{a.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Notifications */}
          <Link
            href="/notifications"
            className={cn(
              "relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground",
              "transition-colors duration-fast hover:bg-muted hover:text-foreground",
            )}
            aria-label="Notificaciones"
          >
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" />
            )}
          </Link>
        </div>
      </div>

      {/* ========== Hero section (opcional, Lumen — sin gradients) ========== */}
      {(title || eyebrow || description || actions) && (
        <motion.header
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          className="flex flex-col gap-3 px-6 pt-6 pb-4 lg:flex-row lg:items-end lg:justify-between lg:px-8"
        >
          <div className="min-w-0 space-y-1">
            {eyebrow && (
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-brand">
                {eyebrow}
              </p>
            )}
            {title && (
              <h1 className="text-[22px] font-bold leading-tight tracking-tight text-foreground">
                {title}
              </h1>
            )}
            {description &&
              (typeof description === "string" ? (
                <p className="max-w-2xl text-[13.5px] text-muted-foreground">
                  {description}
                </p>
              ) : (
                <div className="max-w-2xl text-[13.5px] text-muted-foreground">
                  {description}
                </div>
              ))}
          </div>
          {actions && (
            <div className="flex flex-shrink-0 items-center gap-2">
              {actions}
            </div>
          )}
        </motion.header>
      )}
    </div>
  )
}
