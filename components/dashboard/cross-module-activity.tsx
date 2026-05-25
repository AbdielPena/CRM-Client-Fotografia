"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import {
  Camera, Receipt, Wallet, Package, Mail, Calendar, FileText, Image,
  type LucideIcon,
} from "lucide-react"

import { Card } from "@/components/ui/card"
import { relativeTime } from "@/lib/utils/currency"
import type { ActivityItem, ActivitySource } from "@/lib/types/dashboard"

const sourceMeta: Record<ActivitySource, { icon: LucideIcon; color: string; label: string }> = {
  crm:       { icon: Camera,   color: "#7C3AED", label: "CRM" },
  finance:   { icon: Wallet,   color: "#10B981", label: "Finanzas" },
  inventory: { icon: Package,  color: "#F59E0B", label: "Inventario" },
  fiscal:    { icon: Receipt,  color: "#0EA5E9", label: "Facturación" },
  mail:      { icon: Mail,     color: "#F97316", label: "Correo" },
  gallery:   { icon: Image,    color: "#EC4899", label: "Galerías" },
  contract:  { icon: FileText, color: "#6366F1", label: "Contratos" },
  booking:   { icon: Calendar, color: "#14B8A6", label: "Reservas" },
  system:    { icon: FileText, color: "#71717A", label: "Sistema" },
}

/**
 * CrossModuleActivity — feed unificado de actividad reciente cross-módulo.
 *
 * Portado de studio-hub/src/components/dashboard/activity-feed.tsx, adaptado al
 * monolito (la fuente ya no es eventos federados sino activity_log con `source`).
 *
 * Cada item se puede convertir en un deep-link interno (`entityType + entityId`).
 */
export function CrossModuleActivity({
  items,
  emptyMessage = "Aún no hay actividad reciente. Cuando uses cualquier módulo aparecerá aquí.",
}: {
  items: ActivityItem[]
  emptyMessage?: string
}) {
  if (items.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground rounded-2xl">
        {emptyMessage}
      </Card>
    )
  }

  return (
    <Card className="divide-y rounded-2xl overflow-hidden">
      {items.map((it, i) => {
        const meta = sourceMeta[it.source] ?? sourceMeta.system
        const Icon = meta.icon
        const deepLink = it.entityType && it.entityId
          ? buildDeepLink(it.source, it.entityType, it.entityId)
          : null

        const content = (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i * 0.03 }}
            className="flex items-start gap-3 p-4 transition-colors hover:bg-accent/30"
          >
            <span
              className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: meta.color }}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{it.title}</p>
              {it.description && (
                <p className="truncate text-xs text-muted-foreground">{it.description}</p>
              )}
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{meta.label}</span>
                <span>·</span>
                <span>{relativeTime(it.at)}</span>
                <span>·</span>
                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{it.type}</code>
              </div>
            </div>
          </motion.div>
        )

        return deepLink ? (
          <Link key={it.id} href={deepLink} className="block">{content}</Link>
        ) : (
          <div key={it.id}>{content}</div>
        )
      })}
    </Card>
  )
}

/**
 * Mapeo source + entityType → URL interna. Centralizado para mantener
 * coherencia. Si llega un entityType desconocido, devuelve null (no se hace link).
 */
function buildDeepLink(source: ActivitySource, entityType: string, entityId: string): string | null {
  // CRM
  if (entityType === "client")    return `/clients/${entityId}`
  if (entityType === "lead")      return `/leads/${entityId}`
  if (entityType === "project")   return `/projects/${entityId}`
  if (entityType === "booking")   return `/bookings/${entityId}`
  if (entityType === "task")      return `/tasks/${entityId}`
  // Documentos
  if (entityType === "invoice")   return `/invoices/${entityId}`
  if (entityType === "contract")  return `/contracts/${entityId}`
  if (entityType === "proposal")  return `/proposals/${entityId}`
  // Galerías
  if (entityType === "gallery")   return `/galleries/${entityId}`
  // Finance (F5)
  if (entityType === "fin_transaction") return `/finance/transactions/${entityId}`
  if (entityType === "fin_account")     return `/finance/accounts/${entityId}`
  // Inventory (F3)
  if (entityType === "inv_item")        return `/inventory/items/${entityId}`
  if (entityType === "inv_loan")        return `/inventory/loans/${entityId}`
  if (entityType === "inv_rental")      return `/inventory/rentals/${entityId}`
  // Mail (F6)
  if (entityType === "mail_message")    return `/mail/inbox/${entityId}`

  // Source-based fallback si no conocemos el entityType
  if (source === "crm")       return `/dashboard`
  if (source === "finance")   return `/finance`
  if (source === "inventory") return `/inventory`
  if (source === "mail")      return `/mail`

  return null
}
