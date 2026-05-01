"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import {
  LayoutDashboard,
  Building2,
  Package2,
  ShieldCheck,
  Globe,
  ArrowLeft,
  LogOut,
  ChevronRight,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { ThemeDock } from "@/components/shared/theme-dock"

type NavLink = {
  type: "link"
  href: string
  label: string
  icon: LucideIcon
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
      {
        type: "link",
        href: "/platform",
        label: "Overview",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    type: "group",
    label: "Tenants",
    items: [
      {
        type: "link",
        href: "/platform/studios",
        label: "Studios",
        icon: Building2,
      },
    ],
  },
  {
    type: "group",
    label: "Catálogo",
    items: [
      {
        type: "link",
        href: "/platform/plans",
        label: "Planes y features",
        icon: Package2,
      },
      {
        type: "link",
        href: "/platform/domains",
        label: "Dominios",
        icon: Globe,
      },
    ],
  },
  {
    type: "group",
    label: "Seguridad",
    items: [
      {
        type: "link",
        href: "/platform/admins",
        label: "Super admins",
        icon: ShieldCheck,
      },
    ],
  },
]

// -- animation variants ----------------------------------------------------

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

interface PlatformSidebarProps {
  userName: string
  userEmail: string
}

export function PlatformSidebar({ userName, userEmail }: PlatformSidebarProps) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === "/platform") return pathname === "/platform"
    return pathname === href || pathname.startsWith(href + "/")
  }

  const userInitial = userName.charAt(0).toUpperCase()

  return (
    <motion.aside
      initial="hidden"
      animate="visible"
      variants={shellVariants}
      className={cn(
        "relative flex h-full w-64 flex-shrink-0 flex-col",
        "border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))]",
        "text-[hsl(var(--sidebar-foreground))]",
      )}
    >
      {/* ========== Platform Header ========== */}
      <motion.header
        variants={itemVariants}
        className="flex items-center gap-3 border-b border-[hsl(var(--sidebar-border))] px-5 py-5"
      >
        <div
          aria-hidden
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-xl",
            "bg-aurora text-white shadow-glow",
          )}
        >
          <ShieldCheck className="h-4 w-4" />
          <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/15" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-sm font-semibold text-foreground">
            Platform
          </p>
          <p className="text-caption font-medium tracking-wide text-brand">
            Super admin
          </p>
        </div>
      </motion.header>

      {/* ========== Navigation ========== */}
      <nav
        aria-label="Navegación platform"
        className="flex-1 space-y-5 overflow-y-auto px-3 py-4"
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
                        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm font-medium",
                        "transition-all duration-base ease-standard",
                        active
                          ? "bg-brand/8 text-foreground dark:bg-brand/12"
                          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="platform-sidebar-active"
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
                          "-translate-x-1 opacity-0 transition-all duration-base",
                          "group-hover:translate-x-0 group-hover:opacity-60",
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

      {/* ========== Footer ========== */}
      <motion.footer
        variants={itemVariants}
        className="space-y-2 border-t border-[hsl(var(--sidebar-border))] p-3"
      >
        <Link
          href="/dashboard"
          className={cn(
            "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm font-medium text-muted-foreground",
            "transition-all duration-fast hover:bg-muted/70 hover:text-foreground",
          )}
        >
          <ArrowLeft
            aria-hidden="true"
            className="h-[18px] w-[18px] flex-shrink-0 transition-transform duration-fast group-hover:-translate-x-0.5"
          />
          <span className="flex-1">Volver al studio</span>
        </Link>

        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-caption text-muted-foreground">Tema</span>
          <ThemeDock variant="compact" />
        </div>

        <div
          className={cn(
            "flex items-center gap-2.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2",
          )}
        >
          <div
            aria-hidden
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-aurora text-caption font-semibold text-white shadow-glow"
          >
            {userInitial}
            <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/15" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-caption font-medium text-foreground">
              {userName}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {userEmail}
            </p>
          </div>
          <form action="/auth/signout" method="post" className="flex">
            <button
              type="submit"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md",
                "text-muted-foreground transition-colors duration-fast hover:bg-danger/10 hover:text-danger",
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
