"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Receipt,
  Wallet,
  Package,
  LayoutDashboard,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";

/**
 * AppSwitcher — el switcher único del ecosistema.
 *
 * Mismo componente debe vivir en los 5 frontends (copiado o publicado como
 * paquete). La marca a la izquierda + el sub-app a la derecha. Click abre
 * un dropdown con los 5 destinos.
 *
 * Para los otros 4 sistemas (CRM/Facturación/Finanzas/Inventario), pasar
 * `currentSystem` para destacar dónde estás.
 *
 * El hub usa /launch/[systemId] que emite JWT corto firmado y abre el módulo
 * con sesión nativa. Desde un módulo, los links van al hub (autenticación
 * compartida via cookies cross-subdomain).
 */

type SystemId = "hub" | "crm" | "billing" | "finance" | "inventory";

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL || "https://hub.abbypixel.com";

type SystemDef = {
  id: SystemId;
  name: string;
  short: string;
  description: string;
  href: string;
  icon: typeof Camera;
  accent: string;
  iconBg: string;
};

const SYSTEMS: SystemDef[] = [
  {
    id: "hub",
    name: "Studio · Hub",
    short: "Hub",
    description: "Dashboard central, métricas, actividad cross-system",
    href: `${HUB_URL}/`,
    icon: LayoutDashboard,
    accent: "var(--studio-hub)",
    iconBg: "hsl(var(--studio-hub) / 0.12)",
  },
  {
    id: "crm",
    name: "Studio · CRM",
    short: "CRM",
    description: "Clientes, bookings, galerías, contratos",
    href: `${HUB_URL}/launch/studioflow`,
    icon: Camera,
    accent: "var(--studio-crm)",
    iconBg: "hsl(var(--studio-crm) / 0.12)",
  },
  {
    id: "billing",
    name: "Studio · Facturación",
    short: "Facturación",
    description: "Facturas, NCF, ITBIS, cotizaciones",
    href: `${HUB_URL}/launch/studioflow_platform`,
    icon: Receipt,
    accent: "var(--studio-billing)",
    iconBg: "hsl(var(--studio-billing) / 0.12)",
  },
  {
    id: "finance",
    name: "Studio · Finanzas",
    short: "Finanzas",
    description: "CxC, CxP, bancos, deudas, metas",
    href: `${HUB_URL}/launch/finanzapp`,
    icon: Wallet,
    accent: "var(--studio-finance)",
    iconBg: "hsl(var(--studio-finance) / 0.12)",
  },
  {
    id: "inventory",
    name: "Studio · Inventario",
    short: "Inventario",
    description: "Equipos, préstamos, rentas, mantenimientos",
    href: `${HUB_URL}/launch/inventario`,
    icon: Package,
    accent: "var(--studio-inventory)",
    iconBg: "hsl(var(--studio-inventory) / 0.12)",
  },
];

export function AppSwitcher({
  currentSystem = "hub",
  collapsed = false,
}: {
  currentSystem?: SystemId;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = SYSTEMS.find((s) => s.id === currentSystem) ?? SYSTEMS[0];
  const Icon = current.icon;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={
          "group flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent " +
          (collapsed ? "justify-center" : "")
        }
      >
        <span
          className="inline-flex size-9 items-center justify-center rounded-lg text-white shadow-studio-sm"
          style={{ backgroundColor: `hsl(${current.accent})` }}
        >
          <Icon className="size-4.5" strokeWidth={2.25} />
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight">
                {current.name}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                Studio Suite
              </span>
            </span>
            <ChevronDown
              className={
                "size-4 text-muted-foreground transition-transform " +
                (open ? "rotate-180" : "")
              }
            />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              role="menu"
              className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border bg-popover p-1.5 shadow-studio-xl"
              style={{ minWidth: 280 }}
            >
              <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Studio Suite
              </div>
              {SYSTEMS.map((sys) => {
                const SysIcon = sys.icon;
                const isCurrent = sys.id === currentSystem;
                return (
                  <a
                    key={sys.id}
                    href={sys.href}
                    target={sys.id === "hub" ? "_self" : "_blank"}
                    rel={sys.id === "hub" ? undefined : "noopener noreferrer"}
                    className={
                      "group flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors " +
                      (isCurrent
                        ? "bg-accent"
                        : "hover:bg-accent")
                    }
                    role="menuitem"
                  >
                    <span
                      className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg shadow-studio-sm"
                      style={{ backgroundColor: sys.iconBg, color: `hsl(${sys.accent})` }}
                    >
                      <SysIcon className="size-4.5" strokeWidth={2.25} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold leading-tight">
                          {sys.name}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                            actual
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {sys.description}
                      </span>
                    </span>
                    {sys.id !== "hub" && (
                      <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </a>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
