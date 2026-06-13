"use client"

import * as React from "react"
import { Camera, Receipt, Wallet, Package, LayoutDashboard, ChevronDown, ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils/cn"

/**
 * AppSwitcher del CRM — acceso al Hub y a los demás sistemas del ecosistema
 * (Studio Suite). Reintroducido para la app unificada (PixelOS): desde el CRM
 * el usuario puede volver al Hub o saltar a otra app.
 *
 * CLAVE para la app Android (WebView Capacitor): TODOS los enlaces usan
 * target="_self" para navegar DENTRO de la misma WebView. `target="_blank"`
 * abriría el navegador externo y rompería la experiencia/SSO unificado.
 * `allowNavigation` en capacitor.config permite todos los *.abbypixel.com.
 */

const HUB_URL = "https://hub.abbypixel.com"

type SystemId = "hub" | "crm" | "billing" | "finance" | "inventory"

const SYSTEMS: {
  id: SystemId
  name: string
  description: string
  href: string
  icon: typeof Camera
  color: string
}[] = [
  { id: "hub", name: "Hub", description: "Inicio · panel central", href: `${HUB_URL}/`, icon: LayoutDashboard, color: "#6366f1" },
  { id: "crm", name: "CRM", description: "Clientes, bookings, galerías", href: `${HUB_URL}/launch/studioflow`, icon: Camera, color: "#7C3AED" },
  { id: "billing", name: "Facturación", description: "Facturas, NCF, ITBIS", href: `${HUB_URL}/launch/studioflow_platform`, icon: Receipt, color: "#0EA5E9" },
  { id: "finance", name: "Finanzas", description: "CxC, CxP, bancos, metas", href: `${HUB_URL}/launch/finanzapp`, icon: Wallet, color: "#10B981" },
  { id: "inventory", name: "Inventario", description: "Equipos, préstamos, rentas", href: `${HUB_URL}/launch/inventario`, icon: Package, color: "#F59E0B" },
]

export function AppSwitcher({
  currentSystem = "crm",
  collapsed = false,
}: {
  currentSystem?: SystemId
  collapsed?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const current = SYSTEMS.find((s) => s.id === currentSystem) ?? SYSTEMS[1]
  const Icon = current.icon

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Cambiar de app / volver al Hub"
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent))/40] px-2.5 py-2 text-left transition-colors hover:bg-[hsl(var(--sidebar-accent))]",
          collapsed && "justify-center px-0",
        )}
      >
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
          style={{ backgroundColor: current.color }}
        >
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">
                Studio Suite
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {current.name} · cambiar
              </span>
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-lg"
            style={{ minWidth: 260 }}
          >
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Studio Suite
            </div>
            {SYSTEMS.map((sys) => {
              const SysIcon = sys.icon
              const isCurrent = sys.id === currentSystem
              return (
                <a
                  key={sys.id}
                  href={sys.href}
                  target="_self"
                  onClick={() => setOpen(false)}
                  role="menuitem"
                  className={cn(
                    "group flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors",
                    isCurrent ? "bg-muted" : "hover:bg-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                    style={{ backgroundColor: sys.color }}
                  >
                    <SysIcon className="h-[18px] w-[18px]" strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold leading-tight text-foreground">{sys.name}</span>
                      {isCurrent && (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                          actual
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{sys.description}</span>
                  </span>
                  {!isCurrent && (
                    <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </a>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
