"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowUpRight,
  Camera, Receipt, Wallet, Package, Mail, Calendar, FileText, Image, Truck,
  Sparkles, Box,
  type LucideIcon,
} from "lucide-react"

import { Card } from "@/components/ui/card"

export type ModuleQuickAction = { label: string; href: string }

/**
 * Icon registry — cada módulo declara su iconName por string para serializar
 * desde el server. Aquí mapeamos a componentes Lucide.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  Camera, Receipt, Wallet, Package, Mail, Calendar, FileText, Image, Truck, Sparkles,
}

export type ModuleCardProps = {
  /** Slug interno del módulo (crm, finance, inventory, mail, ...) */
  id: string
  name: string
  description: string
  iconName: string | null
  /** Color del glow/avatar (hex o tailwind var) */
  color: string
  /** Path interno de navegación (eg. "/crm", "/finance") */
  href: string
  /** Status visual del módulo en este studio */
  status?: "ok" | "degraded" | "down" | "unknown"
  /** Acciones rápidas debajo del CTA principal */
  quickActions?: ModuleQuickAction[]
  /** Index para stagger animation (cuando se renderizan en grid) */
  index?: number
  /** Si está deshabilitado (módulo no contratado o por implementar) */
  enabled?: boolean
}

/**
 * ModuleCard — tarjeta del dashboard con CTA "Abrir módulo" + quick actions.
 *
 * Portado de studio-hub/src/components/dashboard/system-card.tsx, adaptado a
 * navegación INTERNA del monolito (sin `/launch/` cross-origin, sin target=_blank).
 *
 * Diseño respetando el design system: rounded-2xl, framer-motion stagger,
 * background glow on hover, status dot.
 */
export function ModuleCard({
  id: _id,
  name,
  description,
  iconName,
  color,
  href,
  status = "ok",
  quickActions = [],
  index = 0,
  enabled = true,
}: ModuleCardProps) {
  const Icon = (iconName && ICON_MAP[iconName]) || Box

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: "easeOut" }}
    >
      <Card
        className={
          "group relative overflow-hidden p-6 transition-shadow rounded-2xl " +
          (enabled ? "hover:shadow-md" : "opacity-60")
        }
      >
        {/* Background glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full opacity-0 blur-3xl transition-opacity group-hover:opacity-30"
          style={{ backgroundColor: color }}
        />

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex size-12 items-center justify-center rounded-full text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              <Icon className="size-6" />
            </span>
            <div>
              <h3 className="text-base font-semibold leading-none">{name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          {enabled ? (
            <StatusDot status={status} />
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              Próximamente
            </span>
          )}
        </div>

        {/* CTA principal — navegación INTERNA, sin prefetch=false porque no hay
            JWT short-lived que quemarse en cada render como en el hub federado. */}
        {enabled ? (
          <Link
            href={href}
            className="mt-5 flex w-full items-center justify-between rounded-xl border bg-background px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            <span>Abrir {name}</span>
            <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        ) : (
          <div className="mt-5 flex w-full cursor-not-allowed items-center justify-between rounded-xl border bg-muted/40 px-3 py-2.5 text-sm font-medium text-muted-foreground">
            <span>Próximamente</span>
            <span className="text-xs">🔒</span>
          </div>
        )}

        {/* Quick actions */}
        {enabled && quickActions.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-1.5">
            {quickActions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="truncate rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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

function StatusDot({ status }: { status: "ok" | "degraded" | "down" | "unknown" }) {
  const cls = {
    ok: "bg-emerald-500",
    degraded: "bg-amber-500",
    down: "bg-red-500",
    unknown: "bg-zinc-400",
  }[status]
  const label = {
    ok: "Operacional",
    degraded: "Degradado",
    down: "Caído",
    unknown: "Sin datos",
  }[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
      title={label}
    >
      <span className={`size-1.5 rounded-full ${cls}`} />
      {label}
    </span>
  )
}
