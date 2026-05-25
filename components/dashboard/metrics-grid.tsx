"use client"

import { motion } from "framer-motion"
import {
  TrendingUp,
  TrendingDown,
  FileText,
  Users,
  Calendar,
  Wallet,
  Receipt,
  PackageX,
  type LucideIcon,
} from "lucide-react"

import { Card } from "@/components/ui/card"
import { formatCurrency, formatNumber } from "@/lib/utils/currency"
import type { DashboardMetrics } from "@/lib/types/dashboard"

type Item = {
  key: keyof DashboardMetrics
  label: string
  icon: LucideIcon
  format: "currency" | "number"
  tone: "positive" | "negative" | "neutral"
}

const items: Item[] = [
  { key: "income_month", label: "Ingresos del mes", icon: TrendingUp, format: "currency", tone: "positive" },
  { key: "expenses_month", label: "Gastos del mes", icon: TrendingDown, format: "currency", tone: "negative" },
  { key: "net_balance", label: "Balance neto", icon: Wallet, format: "currency", tone: "neutral" },
  { key: "invoices_pending", label: "Facturas pendientes", icon: FileText, format: "number", tone: "neutral" },
  { key: "payments_received", label: "Pagos recibidos", icon: Receipt, format: "number", tone: "positive" },
  { key: "customers_new_month", label: "Clientes nuevos", icon: Users, format: "number", tone: "positive" },
  { key: "upcoming_bookings", label: "Reservas próximas", icon: Calendar, format: "number", tone: "neutral" },
  { key: "low_stock_items", label: "Stock bajo", icon: PackageX, format: "number", tone: "negative" },
]

/**
 * MetricsGrid — 8 KPIs cross-módulo en grid responsivo 2-col móvil / 4-col desktop.
 *
 * Portado de studio-hub/src/components/dashboard/metrics-grid.tsx. Misma UI,
 * adaptado a `@/lib/utils/currency` (en lugar de `@/lib/utils`) y al tipo
 * `DashboardMetrics` de `@/lib/types/dashboard`.
 *
 * Animación framer-motion con stagger por index (parte del design system).
 */
export function MetricsGrid({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it, i) => (
        <motion.div
          key={it.key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.04 }}
        >
          <Card className="p-4 rounded-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{it.label}</span>
              <it.icon
                className={
                  it.tone === "positive"
                    ? "size-4 text-emerald-500"
                    : it.tone === "negative"
                    ? "size-4 text-red-500"
                    : "size-4 text-muted-foreground"
                }
              />
            </div>
            <p className="mt-2 text-xl font-semibold tracking-tight">
              {it.format === "currency"
                ? formatCurrency(metrics[it.key] ?? 0)
                : formatNumber(metrics[it.key])}
            </p>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
