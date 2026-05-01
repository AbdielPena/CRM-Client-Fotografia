"use client"

import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  Plus,
  Bell,
  Command,
  UserPlus,
  FolderPlus,
  Receipt,
  FileText,
  Package,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { Button } from "@/components/ui/button"

interface AppTopbarProps {
  title?: string
  eyebrow?: string
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Usa la fuente display serif para el título. */
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
 * Topbar del layout de estudio.
 * - Barra superior sticky con search + quick-new + notifications.
 * - Sección hero opcional con título display + eyebrow + descripción + acciones.
 */
export function AppTopbar({
  title,
  eyebrow,
  description,
  actions,
  display = false,
  unreadNotifications = 0,
  className,
}: AppTopbarProps) {
  const [quickOpen, setQuickOpen] = React.useState(false)
  const quickRef = React.useRef<HTMLDivElement | null>(null)

  // Close quick-actions popover on outside click or Escape
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
      {/* ========== Sticky control bar ========== */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 bg-background/80 px-6 py-3 backdrop-blur-md lg:px-8">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Buscar clientes, proyectos, facturas…"
            className={cn(
              "h-9 w-full rounded-md border border-transparent bg-muted pl-9 pr-14 text-body text-foreground",
              "placeholder:text-muted-foreground",
              "transition-colors duration-fast",
              "hover:bg-muted/80",
              "focus:border-brand/40 focus:bg-background focus:outline-none focus:ring-4 focus:ring-brand/15",
            )}
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Quick New menu */}
          <div className="relative" ref={quickRef}>
            <Button
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setQuickOpen((v) => !v)}
              aria-expanded={quickOpen}
              aria-haspopup="menu"
            >
              Nuevo
            </Button>

            <AnimatePresence>
              {quickOpen && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                  className="absolute right-0 top-[calc(100%+8px)] w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
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
                            "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm text-popover-foreground transition-colors",
                            "hover:bg-muted",
                          )}
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-brand/10 group-hover:text-brand">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
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
              "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground",
              "transition-colors duration-fast hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
            )}
            aria-label="Notificaciones"
          >
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 20,
                }}
                className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-foreground shadow-glow-danger"
              >
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </motion.span>
            )}
          </Link>
        </div>
      </div>

      {/* ========== Hero section (optional) ========== */}
      {(title || eyebrow || description || actions) && (
        <motion.header
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          className="flex flex-col gap-4 border-b border-border/60 px-6 py-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-8"
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
            {title &&
              (display ? (
                <h1 className="font-display text-display-lg leading-[1.05] text-foreground">
                  {title}
                </h1>
              ) : (
                <h1 className="text-h1 font-semibold leading-tight text-foreground">
                  {title}
                </h1>
              ))}
            {description &&
              (typeof description === "string" ? (
                <p className="max-w-2xl text-body text-muted-foreground">
                  {description}
                </p>
              ) : (
                <div className="max-w-2xl text-body text-muted-foreground">
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
