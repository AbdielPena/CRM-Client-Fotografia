"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard,
  Users,
  UserPlus,
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
  Layers,
  Mail,
  Wallet,
  Boxes,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Trash2,
  ShieldCheck,
  Sparkles,
  CreditCard,
  CheckSquare,
  BarChart3,
  Key,
  Webhook,
  Rocket,
  MessageCircle,
  Workflow,
  Activity,
  Bot,
  HeartHandshake,
  Tag,
  MailCheck,
  Shirt,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { useIsMobile } from "@/lib/hooks/use-is-mobile"
import { AppSwitcher } from "./app-switcher"
import { ThemeDock } from "@/components/shared/theme-dock"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSidebar } from "./sidebar-context"

// ---------------------------------------------------------------------------
// Nav schema — dos secciones planas (PRINCIPAL + ACCOUNT) estilo Lumen
// ---------------------------------------------------------------------------

type NavLink = {
  type: "link"
  href: string
  label: string
  icon: LucideIcon
  badge?: number
  /** Abre en pestaña nueva (apps externas del ecosistema, ej. FinanzApp). */
  external?: boolean
}

type NavGroup = {
  type: "group"
  label: string
  items: NavLink[]
}

// Navegación organizada por función y flujo de trabajo:
// adquirir → operar → producir → cobrar → comunicar → automatizar → analizar → configurar.
const NAV_GROUPS: NavGroup[] = [
  {
    type: "group",
    label: "Inicio",
    items: [
      { type: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    // El "quién": conseguir y gestionar clientes y sus trabajos.
    type: "group",
    label: "Clientes",
    items: [
      { type: "link", href: "/bookings", label: "Solicitudes", icon: Inbox },
      { type: "link", href: "/leads", label: "Leads", icon: UserPlus },
      { type: "link", href: "/armario", label: "Vestidos", icon: Shirt },
      { type: "link", href: "/clients", label: "Clientes", icon: Users },
      { type: "link", href: "/onboarding", label: "Onboarding", icon: Rocket },
      { type: "link", href: "/projects", label: "Proyectos", icon: FolderOpen },
    ],
  },
  {
    // Cockpit diario, transversal a todos los clientes.
    type: "group",
    label: "Operaciones",
    items: [
      { type: "link", href: "/calendar", label: "Calendario", icon: CalendarDays },
      { type: "link", href: "/tasks", label: "Tareas", icon: CheckSquare },
    ],
  },
  {
    // Ejecutar y entregar el trabajo fotográfico.
    type: "group",
    label: "Producción",
    items: [
      { type: "link", href: "/deliveries", label: "Pipeline / Entregas", icon: Workflow },
      { type: "link", href: "/galleries", label: "Galerías", icon: ImageIcon },
    ],
  },
  {
    // El dinero, los acuerdos y los activos.
    type: "group",
    label: "Negocio",
    items: [
      // /finance del CRM: lista de pagos + cuentas de FinanzApp + cuenta default.
      // Botón "Abrir FinanzApp" arriba para ir a la app completa.
      { type: "link", href: "/finance", label: "Finanzas", icon: Wallet },
      { type: "link", href: "/invoices", label: "Facturas", icon: Receipt },
      { type: "link", href: "/contracts", label: "Contratos", icon: FileText },
      { type: "link", href: "/inventory/items", label: "Inventario", icon: Boxes },
    ],
  },
  {
    // Todos los canales de mensajería, internos y externos.
    type: "group",
    label: "Comunicación",
    items: [
      { type: "link", href: "/mail/inbox", label: "Correo", icon: Mail },
      { type: "link", href: "/notificaciones", label: "Correos enviados", icon: MailCheck },
      { type: "link", href: "/settings/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { type: "link", href: "/chat", label: "Chat interno", icon: MessageCircle },
      { type: "link", href: "/engagement", label: "Engagement Hub", icon: HeartHandshake },
    ],
  },
  {
    // Trabajo que el sistema hace solo.
    type: "group",
    label: "Automatización",
    items: [
      { type: "link", href: "/ai-assistant", label: "AI Assistant", icon: Bot },
      { type: "link", href: "/automations", label: "Automatizaciones", icon: Sparkles },
    ],
  },
  {
    // Mirar los datos.
    type: "group",
    label: "Análisis",
    items: [
      { type: "link", href: "/reports", label: "Reportes", icon: BarChart3 },
      { type: "link", href: "/status", label: "Estado del sistema", icon: Activity },
    ],
  },
  {
    // Cómo opera el estudio: catálogo, plantillas, marca y fiscal.
    type: "group",
    label: "Configuración",
    items: [
      { type: "link", href: "/settings/service-categories", label: "Categorías de Servicios", icon: Tag },
      { type: "link", href: "/settings/packages", label: "Paquetes", icon: Package },
      { type: "link", href: "/settings/forms", label: "Formularios", icon: ClipboardList },
      { type: "link", href: "/settings/contracts", label: "Plantillas de contrato", icon: FileStack },
      { type: "link", href: "/settings/project-templates", label: "Plantillas de proyecto", icon: Layers },
      { type: "link", href: "/settings/emails/templates", label: "Plantillas de email", icon: Mail },
      { type: "link", href: "/settings/branding", label: "Marca y personalización", icon: Layers },
      { type: "link", href: "/settings/domain", label: "Dominio", icon: Globe },
      { type: "link", href: "/settings/availability", label: "Disponibilidad", icon: Clock },
      { type: "link", href: "/settings/fiscal", label: "Fiscal RD (NCF/ITBIS)", icon: Landmark },
    ],
  },
  {
    // Conexiones con sistemas externos.
    type: "group",
    label: "Integraciones",
    items: [
      {
        type: "link",
        href: "/settings/integrations/google",
        label: "Google Calendar",
        icon: CalendarClock,
      },
      { type: "link", href: "/settings/webhooks", label: "Webhooks salientes", icon: Webhook },
      { type: "link", href: "/settings/api", label: "API y tokens", icon: Key },
    ],
  },
  {
    // Cuenta, equipo, seguridad y recuperación.
    type: "group",
    label: "Cuenta",
    items: [
      { type: "link", href: "/settings", label: "Ajustes generales", icon: Settings },
      { type: "link", href: "/settings/billing", label: "Plan y facturación", icon: CreditCard },
      { type: "link", href: "/settings/members", label: "Miembros del studio", icon: Users },
      { type: "link", href: "/settings/security", label: "Seguridad (2FA)", icon: ShieldCheck },
      { type: "link", href: "/trash", label: "Papelera", icon: Trash2 },
    ],
  },
]

// Persistencia local del estado collapsed por grupo
const COLLAPSED_GROUPS_KEY = "sf-sidebar-groups-collapsed"

function loadCollapsedGroups(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(COLLAPSED_GROUPS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr) : new Set()
  } catch {
    return new Set()
  }
}

function saveCollapsedGroups(s: Set<string>): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      COLLAPSED_GROUPS_KEY,
      JSON.stringify(Array.from(s)),
    )
  } catch {
    // ignore
  }
}

const labelVariants = {
  expanded: { opacity: 1, width: "auto", marginLeft: 12 },
  collapsed: { opacity: 0, width: 0, marginLeft: 0 },
}

interface AppSidebarProps {
  studioName: string
  userName: string
  userEmail: string
  userRole: string
  unreadNotifications?: number
  /** Conteos de "novedad" por sección (href → número) para los badges flotantes. */
  badges?: Record<string, number>
}

export function AppSidebar({
  studioName,
  userName,
  userEmail,
  unreadNotifications = 0,
  badges = {},
}: AppSidebarProps) {
  const pathname = usePathname()
  const { collapsed: collapsedDesktop, toggle, mobileOpen, setMobileOpen } = useSidebar()
  const isMobile = useIsMobile()

  // En móvil el drawer siempre se muestra expandido (labels visibles); el colapso
  // a solo-iconos es una preferencia exclusiva de desktop. Derivamos `collapsed`
  // de una sola fuente para no tocar el resto del render.
  const collapsed = isMobile ? false : collapsedDesktop

  // Cerrar el drawer al navegar a otra ruta.
  React.useEffect(() => {
    setMobileOpen(false)
  }, [pathname, setMobileOpen])

  const isActive = React.useCallback(
    (href: string) => {
      if (href === "/dashboard") return pathname === "/dashboard"
      return pathname === href || pathname.startsWith(href + "/")
    },
    [pathname],
  )

  // Estado collapsed por grupo (persiste en localStorage). Hidrata cliente-side
  // para evitar mismatch SSR.
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(
    () => new Set(),
  )
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    setCollapsedGroups(loadCollapsedGroups())
    setHydrated(true)
  }, [])

  const toggleGroup = React.useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      saveCollapsedGroups(next)
      return next
    })
  }, [])

  // Auto-expand un grupo si la ruta activa cae en alguno de sus items
  // (solo en el primer render hidratado, no en cada navegación para no
  // re-abrir grupos que el usuario cerró voluntariamente)
  const autoExpandedRef = React.useRef(false)
  React.useEffect(() => {
    if (!hydrated || autoExpandedRef.current) return
    autoExpandedRef.current = true
    const activeGroups = NAV_GROUPS.filter((g) =>
      g.items.some((i) => isActive(i.href)),
    ).map((g) => g.label)
    if (activeGroups.length === 0) return
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const lbl of activeGroups) {
        if (next.has(lbl)) {
          next.delete(lbl)
          changed = true
        }
      }
      if (changed) saveCollapsedGroups(next)
      return changed ? next : prev
    })
  }, [hydrated, isActive])

  const initial = studioName.charAt(0).toUpperCase()
  const userInitial = userName.charAt(0).toUpperCase()

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={80}>
      {/* Overlay — solo móvil cuando el drawer está abierto. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      <aside
        data-collapsed={collapsed}
        className={cn(
          "z-50 flex h-full flex-shrink-0 flex-col overflow-hidden",
          // Ancho por CSS, NO por framer: el transform inline de motion pisaba
          // las clases translate y el drawer no se ocultaba en móvil.
          "w-64",
          collapsed ? "lg:w-[72px]" : "lg:w-64",
          // Móvil: drawer off-canvas fijo que entra desde la izquierda.
          // NO transicionar `transform`: Tailwind translate usa var(--tw-translate-x)
          // y Chromium no interpola transforms basados en variables (el panel se
          // quedaba pegado oculto). Solo animamos width.
          "fixed inset-y-0 left-0 transition-[width] duration-300 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: parte del flujo, siempre visible.
          "lg:relative lg:z-20 lg:translate-x-0",
          "bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))]",
          "text-[hsl(var(--sidebar-foreground))]",
        )}
      >
        {/* ======================== Header ========================
            Brand simple del studio. Antes vivía el AppSwitcher cross-system
            del hub federado (5 destinos, JWT corto). Tras la unificación a
            monolito (F8 hub-kill), solo necesitamos identificar el studio. */}
        <header
          className={cn(
            "relative flex h-[64px] items-center border-b border-[hsl(var(--sidebar-border))]",
            collapsed ? "justify-center px-2" : "gap-3 px-3",
          )}
        >
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-3 rounded-lg transition-colors hover:bg-[hsl(var(--sidebar-accent))/50]",
              collapsed ? "size-10 justify-center" : "min-w-0 flex-1 px-2 py-1.5",
            )}
            title={studioName}
          >
            {collapsed ? (
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand/70 text-sm font-bold text-brand-foreground shadow-sm"
              >
                {initial}
              </span>
            ) : (
              <span
                className="brand-logo text-foreground"
                style={{ height: "26px", width: "121px" }}
                role="img"
                aria-label={studioName}
              />
            )}
          </Link>
        </header>

        {/* ======================== Navigation ======================== */}
        <nav
          aria-label="Navegación principal"
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden py-4",
            collapsed ? "px-2 space-y-1" : "px-3 space-y-5",
          )}
        >
          {/* Switcher del ecosistema: volver al Hub / cambiar de app (Studio Suite). */}
          <div className={cn(collapsed ? "px-0" : "px-0", "pb-1")}>
            <AppSwitcher currentSystem="crm" collapsed={collapsed} />
          </div>

          {NAV_GROUPS.map((group, gIdx) => {
            const isGroupCollapsed = hydrated && collapsedGroups.has(group.label)
            const hasActiveChild = group.items.some((i) => isActive(i.href))

            return (
              <div key={group.label}>
                {/* Header collapsible (solo cuando sidebar está expandida) */}
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={!isGroupCollapsed}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 pb-1.5 pt-1",
                      "text-[10.5px] font-semibold uppercase tracking-[0.12em]",
                      "transition-colors duration-fast",
                      "hover:text-foreground",
                      hasActiveChild
                        ? "text-foreground/80"
                        : "text-muted-foreground/70",
                    )}
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "h-3 w-3 transition-transform duration-base",
                        isGroupCollapsed && "-rotate-90",
                      )}
                    />
                  </button>
                )}

                {/* Divisor decorativo entre grupos cuando sidebar colapsada */}
                {collapsed && gIdx > 0 && (
                  <div
                    aria-hidden
                    className="mx-auto my-2 h-px w-6 bg-[hsl(var(--sidebar-border))]"
                  />
                )}

                {/* Items — animados con AnimatePresence cuando expandido */}
                <AnimatePresence initial={false}>
                  {(collapsed || !isGroupCollapsed) && (
                    <motion.div
                      key={`items-${group.label}`}
                      initial={
                        collapsed ? false : { height: 0, opacity: 0 }
                      }
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-0.5">
                        {group.items.map((item) => {
                          const Icon = item.icon
                          const active = isActive(item.href)
                          const badgeCount = badges[item.href] ?? 0

                          const linkContent = (
                            <Link
                              href={item.href}
                              {...(item.external
                                ? { target: "_blank", rel: "noreferrer" }
                                : {})}
                              className={cn(
                                "group relative flex items-center rounded-lg text-[13px] font-medium",
                                "transition-colors duration-fast",
                                collapsed
                                  ? "h-10 w-full justify-center"
                                  : "px-3 py-2",
                                active
                                  ? "bg-brand-soft text-brand"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                            >
                              <Icon
                                aria-hidden="true"
                                className={cn(
                                  "h-[18px] w-[18px] flex-shrink-0",
                                  active ? "text-brand" : "text-muted-foreground/90",
                                )}
                              />
                              {badgeCount > 0 && collapsed && (
                                <span className="absolute right-1 top-1 min-w-[14px] rounded-full bg-danger px-0.5 text-center text-[8px] font-bold leading-[14px] text-danger-foreground">
                                  {badgeCount > 9 ? "9+" : badgeCount}
                                </span>
                              )}
                              <motion.span
                                animate={collapsed ? "collapsed" : "expanded"}
                                variants={labelVariants}
                                transition={{
                                  duration: 0.18,
                                  ease: [0.32, 0.72, 0, 1],
                                }}
                                className="overflow-hidden whitespace-nowrap"
                              >
                                {item.label}
                              </motion.span>
                              {badgeCount > 0 && !collapsed && (
                                <span className="ml-auto min-w-[18px] rounded-full bg-danger px-1.5 text-center text-[10px] font-bold leading-[18px] text-danger-foreground">
                                  {badgeCount > 99 ? "99+" : badgeCount}
                                </span>
                              )}
                            </Link>
                          )

                          if (collapsed) {
                            return (
                              <Tooltip key={item.href}>
                                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                                <TooltipContent side="right" className="text-xs">
                                  {item.label}
                                </TooltipContent>
                              </Tooltip>
                            )
                          }

                          return <div key={item.href}>{linkContent}</div>
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </nav>

        {/* ======================== Footer ======================== */}
        <footer
          className={cn(
            "border-t border-[hsl(var(--sidebar-border))]",
            collapsed ? "px-2 py-3 space-y-2" : "p-3 space-y-2",
          )}
        >
          {/* Notificaciones */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/notifications"
                  className={cn(
                    "group relative mx-auto flex h-10 w-10 items-center justify-center rounded-lg",
                    "text-muted-foreground transition-colors duration-fast",
                    "hover:bg-muted hover:text-foreground",
                  )}
                  aria-label={`Notificaciones${unreadNotifications > 0 ? ` (${unreadNotifications})` : ""}`}
                >
                  <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
                  {unreadNotifications > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" />
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Notificaciones
                {unreadNotifications > 0 && (
                  <span className="ml-1 text-danger">({unreadNotifications})</span>
                )}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href="/notifications"
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2",
                "text-[13px] font-medium text-muted-foreground",
                "hover:bg-muted hover:text-foreground transition-colors duration-fast",
              )}
            >
              <div className="relative">
                <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
                {unreadNotifications > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-danger px-1 text-[9px] font-bold leading-[16px] text-danger-foreground text-center">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                )}
              </div>
              <span className="flex-1">Notificaciones</span>
            </Link>
          )}

          {/* Tema */}
          {collapsed ? (
            <div className="flex justify-center">
              <ThemeDock variant="compact" />
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg px-3 py-2">
              <span className="text-[12px] text-muted-foreground">Tema</span>
              <ThemeDock variant="compact" />
            </div>
          )}

          {/* Toggle Hide/Expand — siempre presente */}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expandir" : "Ocultar"}
            className={cn(
              "group flex items-center rounded-lg text-[13px] font-medium text-muted-foreground",
              "transition-colors duration-fast hover:bg-muted hover:text-foreground",
              collapsed
                ? "mx-auto h-10 w-10 justify-center"
                : "w-full gap-3 px-3 py-2",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" />
            ) : (
              <PanelLeftClose className="h-[18px] w-[18px]" />
            )}
            <motion.span
              animate={collapsed ? "collapsed" : "expanded"}
              variants={labelVariants}
              transition={{ duration: 0.18 }}
              className="overflow-hidden whitespace-nowrap"
            >
              Ocultar
            </motion.span>
          </button>

          {/* Usuario */}
          <div
            className={cn(
              "border-t border-[hsl(var(--sidebar-border))] pt-2",
              collapsed ? "" : "",
            )}
          >
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "mx-auto flex h-9 w-9 items-center justify-center rounded-full",
                      "bg-brand text-xs font-semibold text-brand-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                    )}
                    aria-label={userName}
                  >
                    {userInitial}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px]">
                  <div className="text-xs">
                    <p className="font-semibold text-foreground">{userName}</p>
                    <p className="truncate text-muted-foreground">{userEmail}</p>
                    <form
                      action="/auth/signout"
                      method="post"
                      className="mt-2 border-t border-border/60 pt-2"
                    >
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-danger hover:underline"
                      >
                        <LogOut className="h-3 w-3" /> Cerrar sesión
                      </button>
                    </form>
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex items-center gap-3 rounded-lg px-3 py-2">
                <div
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground"
                >
                  {userInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-foreground leading-tight">
                    {userName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground leading-tight">
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
                      "text-muted-foreground hover:bg-danger/10 hover:text-danger transition-colors duration-fast",
                    )}
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </form>
              </div>
            )}
          </div>
        </footer>
      </aside>
    </TooltipProvider>
  )
}
