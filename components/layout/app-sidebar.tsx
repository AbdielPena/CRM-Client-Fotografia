"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import {
  LayoutDashboard,
  UserCheck,
  Users,
  FolderOpen,
  CalendarDays,
  ImageIcon,
  FileText,
  Receipt,
  Package,
  Settings,
  LogOut,
  Bell,
  Inbox,
  Clock,
  ClipboardList,
  FileStack,
  Globe,
  CalendarClock,
  ChevronRight,
  Layers,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { ThemeDock } from "@/components/shared/theme-dock"

// ---------------------------------------------------------------------------
// Nav schema — agrupado por secciones, cada una con overline label
// ---------------------------------------------------------------------------

type NavLink = {
  type: "link"
  href: string
  label: string
  icon: LucideIcon
  badge?: number
}

type NavGroup = {
  type: "group"
  label: string
  items: NavLink[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    type: "group",
    label: "Principal",
    items: [
      { type: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { type: "link", href: "/bookings", label: "Solicitudes", icon: Inbox },
    ],
  },
  {
    type: "group",
    label: "CRM",
    items: [
      { type: "link", href: "/leads", label: "Leads", icon: UserCheck },
      { type: "link", href: "/clients", label: "Clientes", icon: Users },
      { type: "link", href: "/projects", label: "Proyectos", icon: FolderOpen },
      { type: "link", href: "/calendar", label: "Calendario", icon: CalendarDays },
      {
        type: "link",
        href: "/settings/availability",
        label: "Disponibilidad",
        icon: Clock,
      },
    ],
  },
  {
    type: "group",
    label: "Entregas",
    items: [{ type: "link", href: "/galleries", label: "Galerías", icon: ImageIcon }],
  },
  {
    type: "group",
    label: "Finanzas",
    items: [
      { type: "link", href: "/contracts", label: "Contratos", icon: FileText },
      { type: "link", href: "/invoices", label: "Facturas", icon: Receipt },
      { type: "link", href: "/settings/packages", label: "Paquetes", icon: Package },
      { type: "link", href: "/settings/project-statuses", label: "Estados", icon: Layers },
      {
        type: "link",
        href: "/settings/forms",
        label: "Formularios",
        icon: ClipboardList,
      },
      {
        type: "link",
        href: "/settings/contracts",
        label: "Plantillas",
        icon: FileStack,
      },
    ],
  },
  {
    type: "group",
    label: "Cuenta",
    items: [
      { type: "link", href: "/settings/domain", label: "Dominio", icon: Globe },
      {
        type: "link",
        href: "/settings/integrations/google",
        label: "Google Calendar",
        icon: CalendarClock,
      },
      { type: "link", href: "/settings", label: "Configuración", icon: Settings },
    ],
  },
]

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const shellVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0.05,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 400, damping: 30 },
  },
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AppSidebarProps {
  studioName: string
  userName: string
  userEmail: string
  userRole: string
  unreadNotifications?: number
}

export function AppSidebar({
  studioName,
  userName,
  userEmail,
  unreadNotifications = 0,
}: AppSidebarProps) {
  const pathname = usePathname()

  const isActive = React.useCallback(
    (href: string) => {
      if (href === "/dashboard") return pathname === "/dashboard"
      return pathname === href || pathname.startsWith(href + "/")
    },
    [pathname],
  )

  const initial = studioName.charAt(0).toUpperCase()
  const userInitial = userName.charAt(0).toUpperCase()

  return (
    <motion.aside
      initial="hidden"
      animate="visible"
      variants={shellVariants}
      className={cn(
        "relative flex h-full w-64 flex-shrink-0 flex-col",
        "bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))]",
        "text-[hsl(var(--sidebar-foreground))]",
      )}
    >
      {/* ======================== Studio Header ======================== */}
      <motion.header
        variants={itemVariants}
        className="flex items-center gap-3 px-5 py-5 border-b border-[hsl(var(--sidebar-border))]"
      >
        <div
          aria-hidden
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-xl",
            "bg-aurora text-white text-body-sm font-semibold leading-none",
            "shadow-glow",
          )}
        >
          {initial}
          <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/15" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body-sm font-semibold text-foreground truncate">
            {studioName}
          </p>
          <p className="text-caption text-muted-foreground tracking-wide">
            StudioFlow
          </p>
        </div>
      </motion.header>

      {/* ======================== Navigation ======================== */}
      <nav
        aria-label="Navegación principal"
        className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <motion.p
              variants={itemVariants}
              className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80"
            >
              {group.label}
            </motion.p>

            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)

                return (
                  <motion.div key={item.href} variants={itemVariants}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-md",
                        "px-2.5 py-2 text-body-sm font-medium",
                        "transition-all duration-base ease-standard",
                        active
                          ? "text-foreground bg-brand/8 dark:bg-brand/12"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/70",
                      )}
                    >
                      {/* Active indicator bar (scaled) */}
                      {active && (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-aurora shadow-glow"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 30,
                          }}
                        />
                      )}

                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "h-[18px] w-[18px] flex-shrink-0 transition-colors duration-fast",
                          active
                            ? "text-brand"
                            : "text-muted-foreground/80 group-hover:text-foreground",
                        )}
                      />
                      <span className="truncate">{item.label}</span>

                      <ChevronRight
                        aria-hidden="true"
                        className={cn(
                          "ml-auto h-3.5 w-3.5 flex-shrink-0",
                          "opacity-0 -translate-x-1 transition-all duration-base",
                          "group-hover:opacity-60 group-hover:translate-x-0",
                          active && "opacity-0",
                        )}
                      />
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ======================== Footer ======================== */}
      <motion.footer
        variants={itemVariants}
        className="border-t border-[hsl(var(--sidebar-border))] p-3 space-y-2"
      >
        {/* Notifications row */}
        <Link
          href="/notifications"
          className={cn(
            "group flex items-center gap-2.5 px-2.5 py-2 rounded-md",
            "text-body-sm font-medium text-muted-foreground",
            "hover:bg-muted/70 hover:text-foreground",
            "transition-all duration-fast",
          )}
        >
          <div className="relative">
            <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
            {unreadNotifications > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-danger text-danger-foreground text-[9px] font-bold leading-[14px] text-center shadow-glow-danger"
                aria-label={`${unreadNotifications} sin leer`}
              >
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </motion.span>
            )}
          </div>
          <span className="flex-1">Notificaciones</span>
        </Link>

        {/* Theme toggle (compact) */}
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-caption text-muted-foreground">Tema</span>
          <ThemeDock variant="compact" />
        </div>

        {/* User row */}
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-md border border-border/60 bg-muted/30",
            "px-2.5 py-2",
          )}
        >
          <div
            aria-hidden
            className="relative flex h-8 w-8 items-center justify-center rounded-full bg-aurora text-white text-caption font-semibold shrink-0 shadow-glow"
          >
            {userInitial}
            <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/15" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-caption font-medium text-foreground truncate">
              {userName}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{userEmail}</p>
          </div>
          <form action="/auth/signout" method="post" className="flex">
            <button
              type="submit"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md",
                "text-muted-foreground hover:text-danger hover:bg-danger/10",
                "transition-colors duration-fast",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30",
              )}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </form>
        </div>
      </motion.footer>
    </motion.aside>
  )
}
