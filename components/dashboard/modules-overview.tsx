"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import {
  Camera,
  Wallet,
  Package,
  Mail,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react"

import { Card } from "@/components/ui/card"
import type { ModuleSummary } from "@/server/services/modules-overview.service"

const ICON_MAP: Record<string, LucideIcon> = {
  Camera,
  Wallet,
  Package,
  Mail,
}

/**
 * ModulesOverview — sección del dashboard que muestra una card por cada módulo
 * del monolito con sus KPIs principales + link interno + quick actions.
 *
 * Diseño: grid 1-col móvil / 2-col tablet / 4-col desktop. framer-motion
 * stagger por index. Background glow on hover usando el color del módulo.
 */
export function ModulesOverview({ modules }: { modules: ModuleSummary[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {modules.map((m, idx) => (
        <ModuleSummaryCard key={m.id} module={m} index={idx} />
      ))}
    </div>
  )
}

function ModuleSummaryCard({ module, index }: { module: ModuleSummary; index: number }) {
  const Icon = ICON_MAP[module.iconName] ?? Camera

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: "easeOut" }}
    >
      <Card
        className={
          "group relative overflow-hidden p-5 transition-shadow rounded-2xl h-full " +
          (module.enabled ? "hover:shadow-md" : "opacity-70")
        }
      >
        {/* Background glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full opacity-0 blur-3xl transition-opacity group-hover:opacity-25"
          style={{ backgroundColor: module.color }}
        />

        {/* Header con icon + nombre */}
        <div className="relative flex items-center gap-3">
          <span
            className="inline-flex size-10 items-center justify-center rounded-full text-white shadow-sm"
            style={{ backgroundColor: module.color }}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-none">
              {module.name}
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {module.description}
            </p>
          </div>
          <StatusDot status={module.status} />
        </div>

        {/* KPIs */}
        {module.kpis.length > 0 && (
          <ul className="relative mt-4 space-y-1.5">
            {module.kpis.map((k) => (
              <li
                key={k.label}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="text-muted-foreground">{k.label}</span>
                <span className={`font-semibold tabular-nums ${toneClass(k.tone)}`}>
                  {k.value}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* CTA principal */}
        {module.enabled ? (
          <Link
            href={module.href}
            className="relative mt-4 flex w-full items-center justify-between rounded-xl border bg-background px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
          >
            <span>Abrir {module.name}</span>
            <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        ) : (
          <div className="relative mt-4 flex w-full cursor-not-allowed items-center justify-between rounded-xl border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>Configurar primero</span>
            <span className="text-[10px]">🔒</span>
          </div>
        )}

        {/* Quick actions */}
        {module.quickActions.length > 0 && (
          <div className="relative mt-2.5 flex flex-wrap gap-1.5">
            {module.quickActions.slice(0, 3).map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="truncate rounded-lg bg-muted px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  )
}

function StatusDot({
  status,
}: {
  status: "ok" | "degraded" | "down" | "unknown"
}) {
  const cls = {
    ok: "bg-emerald-500",
    degraded: "bg-amber-500",
    down: "bg-red-500",
    unknown: "bg-zinc-400",
  }[status]
  const label = {
    ok: "Activo",
    degraded: "Atención",
    down: "Caído",
    unknown: "Sin datos",
  }[status]
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/70 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
      title={label}
    >
      <span className={`size-1.5 rounded-full ${cls}`} />
      {label}
    </span>
  )
}

function toneClass(tone?: "positive" | "warning" | "danger" | "neutral"): string {
  switch (tone) {
    case "positive":
      return "text-emerald-600 dark:text-emerald-400"
    case "warning":
      return "text-amber-600 dark:text-amber-400"
    case "danger":
      return "text-red-600 dark:text-red-400"
    default:
      return "text-foreground"
  }
}
