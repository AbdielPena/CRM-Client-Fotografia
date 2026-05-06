"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  UserCheck,
  Users,
  CalendarDays,
  Receipt,
  FileText,
  Package,
  Inbox,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  Trash2,
  CreditCard,
  Mail,
  Sparkles,
  ClipboardList,
  Truck,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"

export type RichActivityRow = {
  id: string
  action: string
  entityType: string | null
  entityId: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  href: string | null
  isOrphan: boolean
}

interface Props {
  items: RichActivityRow[]
  emptyLabel?: string
  className?: string
}

/**
 * Activity feed enriquecido con icon + tone derivados del action,
 * tooltip detallado al hover, click navegación, y badge si el registro
 * está en trash o fue eliminado.
 */
export function RecentActivityRich({
  items,
  emptyLabel = "Sin actividad reciente.",
  className,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  return (
    <ul className={cn("space-y-1", className)}>
      {items.map((item, i) => {
        const meta = ACTION_META[item.action] ?? FALLBACK_META(item)
        const Icon = meta.icon
        const Wrapper = item.href && !item.isOrphan ? Link : "div"
        const wrapperProps = item.href && !item.isOrphan ? { href: item.href } : {}
        const isClickable = !!item.href && !item.isOrphan

        const title = meta.title(item)
        const description = meta.description(item)
        const tooltip = meta.tooltip(item)

        return (
          <motion.li
            key={item.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.32,
              delay: 0.04 * i,
              ease: [0.32, 0.72, 0, 1],
            }}
          >
            <Wrapper
              {...(wrapperProps as { href: string })}
              title={tooltip}
              className={cn(
                "group flex items-start gap-3 rounded-lg px-2 py-2.5 -mx-2",
                "transition-colors duration-fast",
                isClickable && "hover:bg-muted cursor-pointer",
                item.isOrphan && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
                  TONE_STYLES[meta.tone],
                )}
              >
                <Icon className="h-4 w-4" />
              </span>

              <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[13px] font-semibold text-foreground leading-tight">
                      {title}
                    </p>
                    {item.isOrphan && (
                      <span
                        title="El registro relacionado fue eliminado o está en papelera"
                        className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                        eliminado
                      </span>
                    )}
                  </div>
                  {description && (
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground leading-snug">
                      {description}
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 whitespace-nowrap text-[11.5px] text-muted-foreground">
                  {timeAgo(new Date(item.createdAt))}
                </span>
              </div>
            </Wrapper>
          </motion.li>
        )
      })}
    </ul>
  )
}

// ============================================================================
// Mapeo de actions → icono / tono / texto
// ============================================================================

type ActionMeta = {
  icon: LucideIcon
  tone: ActivityTone
  title: (r: RichActivityRow) => string
  description: (r: RichActivityRow) => string | null
  tooltip: (r: RichActivityRow) => string
}

type ActivityTone = "blue" | "emerald" | "violet" | "amber" | "rose" | "slate"

const TONE_STYLES: Record<ActivityTone, string> = {
  blue: "bg-brand-soft text-brand",
  emerald:
    "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  violet:
    "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  amber:
    "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  slate:
    "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
}

const ACTION_META: Record<string, ActionMeta> = {
  // Clientes
  "client.created": {
    icon: Users,
    tone: "blue",
    title: (r) => "Nuevo cliente",
    description: (r) => metaStr(r.metadata, "name") ?? r.description,
    tooltip: (r) => `Cliente creado: ${metaStr(r.metadata, "name") ?? "—"}`,
  },
  "client.updated": {
    icon: Users,
    tone: "slate",
    title: () => "Cliente actualizado",
    description: (r) => r.description,
    tooltip: () => "Datos del cliente modificados",
  },
  "client.deleted": {
    icon: Trash2,
    tone: "rose",
    title: () => "Cliente eliminado",
    description: (r) => metaStr(r.metadata, "reason") ?? r.description,
    tooltip: () => "Cliente movido a papelera",
  },
  "client.restored": {
    icon: CheckCircle2,
    tone: "emerald",
    title: () => "Cliente restaurado",
    description: (r) => r.description,
    tooltip: () => "Cliente regresó desde papelera",
  },

  // Proyectos
  "project.created": {
    icon: Sparkles,
    tone: "violet",
    title: () => "Proyecto creado",
    description: (r) => metaStr(r.metadata, "name") ?? r.description,
    tooltip: (r) => `Proyecto: ${metaStr(r.metadata, "name") ?? "—"}`,
  },
  "project.status_changed": {
    icon: CheckCircle2,
    tone: "violet",
    title: () => "Cambio de estado",
    description: (r) => {
      const from = metaStr(r.metadata, "from")
      const to = metaStr(r.metadata, "to")
      return from && to ? `${from} → ${to}` : r.description
    },
    tooltip: () => "El proyecto cambió de fase",
  },
  "project.updated": {
    icon: Sparkles,
    tone: "slate",
    title: () => "Proyecto actualizado",
    description: (r) => r.description,
    tooltip: () => "Datos del proyecto modificados",
  },

  // Facturas
  "invoice.created": {
    icon: Receipt,
    tone: "amber",
    title: () => "Factura creada",
    description: (r) => {
      const num = metaStr(r.metadata, "invoice_number")
      const total = metaNum(r.metadata, "total")
      return num && total ? `${num} · ${formatMoney(total)}` : r.description
    },
    tooltip: (r) =>
      `Factura ${metaStr(r.metadata, "invoice_number") ?? ""} por ${formatMoney(metaNum(r.metadata, "total") ?? 0)}`,
  },
  "invoice.sent": {
    icon: Mail,
    tone: "blue",
    title: () => "Factura enviada",
    description: (r) => metaStr(r.metadata, "invoice_number") ?? r.description,
    tooltip: () => "Factura enviada al cliente por email",
  },
  "invoice.paid": {
    icon: CheckCircle2,
    tone: "emerald",
    title: () => "Factura pagada",
    description: (r) => metaStr(r.metadata, "invoice_number") ?? r.description,
    tooltip: () => "Factura marcada como pagada",
  },

  // Pagos
  "payment.recorded": {
    icon: CreditCard,
    tone: "emerald",
    title: () => "Pago recibido",
    description: (r) => {
      const amt = metaNum(r.metadata, "amount")
      const method = metaStr(r.metadata, "method")
      return amt
        ? `${formatMoney(amt)}${method ? ` · ${method}` : ""}`
        : r.description
    },
    tooltip: (r) =>
      `Pago recibido${metaStr(r.metadata, "method") ? ` por ${metaStr(r.metadata, "method")}` : ""}`,
  },

  // Contratos
  "contract.created": {
    icon: FileText,
    tone: "violet",
    title: () => "Contrato creado",
    description: (r) => metaStr(r.metadata, "title") ?? r.description,
    tooltip: () => "Nuevo contrato listo para enviar",
  },
  "contract.sent": {
    icon: Mail,
    tone: "blue",
    title: () => "Contrato enviado",
    description: (r) => r.description,
    tooltip: () => "Contrato enviado al cliente para firmar",
  },
  "contract.viewed": {
    icon: FileText,
    tone: "amber",
    title: () => "Contrato visto",
    description: (r) => "El cliente abrió el contrato",
    tooltip: () => "El cliente vio el contrato",
  },
  "contract.signed_by_client": {
    icon: CheckCircle2,
    tone: "emerald",
    title: () => "Contrato firmado por cliente",
    description: (r) => r.description,
    tooltip: () => "El cliente firmó el contrato",
  },
  "contract.signed_by_studio": {
    icon: CheckCircle2,
    tone: "emerald",
    title: () => "Contrato firmado por el estudio",
    description: (r) => r.description,
    tooltip: () => "El estudio firmó el contrato",
  },

  // Galerías
  "gallery.created": {
    icon: ImageIcon,
    tone: "violet",
    title: () => "Galería creada",
    description: (r) => metaStr(r.metadata, "name") ?? r.description,
    tooltip: () => "Nueva galería lista",
  },
  "gallery.published": {
    icon: ImageIcon,
    tone: "emerald",
    title: () => "Galería publicada",
    description: (r) => r.description,
    tooltip: () => "Galería visible para el cliente",
  },
  "gallery.shared": {
    icon: Mail,
    tone: "blue",
    title: () => "Galería compartida",
    description: (r) => r.description,
    tooltip: () => "Link de la galería enviado al cliente",
  },
  "gallery.selection_submitted": {
    icon: CheckCircle2,
    tone: "emerald",
    title: () => "Selección recibida",
    description: (r) => {
      const n = metaNum(r.metadata, "count")
      return n ? `${n} fotos seleccionadas` : r.description
    },
    tooltip: () => "El cliente envió su selección de fotos",
  },

  // Entregas
  "delivery.created": {
    icon: Truck,
    tone: "violet",
    title: () => "Entrega creada",
    description: (r) => metaStr(r.metadata, "name") ?? r.description,
    tooltip: () => "Entrega final preparada",
  },
  "delivery.sent": {
    icon: Mail,
    tone: "blue",
    title: () => "Entrega enviada al cliente",
    description: (r) => r.description,
    tooltip: () => "Entrega enviada para revisión",
  },
  "delivery.reviewed": {
    icon: CheckCircle2,
    tone: "emerald",
    title: () => "Entrega aprobada",
    description: (r) => r.description,
    tooltip: () => "El cliente aprobó la entrega final",
  },

  // Bookings
  "booking.received": {
    icon: Inbox,
    tone: "blue",
    title: () => "Solicitud de reserva",
    description: (r) => metaStr(r.metadata, "client_name") ?? r.description,
    tooltip: () => "Nueva solicitud pública de reserva",
  },
  "booking.approved": {
    icon: CheckCircle2,
    tone: "emerald",
    title: () => "Reserva aprobada",
    description: (r) => r.description,
    tooltip: () => "Reserva aprobada — auto-creó cliente, contrato y factura",
  },
  "booking.rejected": {
    icon: AlertCircle,
    tone: "rose",
    title: () => "Reserva rechazada",
    description: (r) => metaStr(r.metadata, "reason") ?? r.description,
    tooltip: () => "La reserva fue rechazada",
  },

  // Leads
  "lead.created": {
    icon: UserCheck,
    tone: "blue",
    title: () => "Nuevo lead",
    description: (r) => metaStr(r.metadata, "name") ?? r.description,
    tooltip: () => "Nuevo lead capturado",
  },
  "lead.converted": {
    icon: CheckCircle2,
    tone: "emerald",
    title: () => "Lead convertido a cliente",
    description: (r) => r.description,
    tooltip: () => "El lead se convirtió en cliente",
  },

  // Forms
  "form_template.created": {
    icon: ClipboardList,
    tone: "violet",
    title: () => "Plantilla de formulario creada",
    description: (r) => metaStr(r.metadata, "name") ?? r.description,
    tooltip: () => "Nueva plantilla de formulario",
  },
  "form_response.sent": {
    icon: Mail,
    tone: "blue",
    title: () => "Formulario enviado",
    description: (r) => r.description,
    tooltip: () => "Formulario enviado al cliente",
  },
  "forms.auto_created": {
    icon: ClipboardList,
    tone: "blue",
    title: () => "Formularios auto-generados",
    description: (r) => {
      const n = metaNum(r.metadata, "count")
      return n ? `${n} formularios desde el paquete` : r.description
    },
    tooltip: () => "Formularios generados automáticamente desde el paquete",
  },

  // Packages
  "package.created": {
    icon: Package,
    tone: "violet",
    title: () => "Paquete creado",
    description: (r) => metaStr(r.metadata, "name") ?? r.description,
    tooltip: () => "Nuevo paquete de servicios",
  },
}

function FALLBACK_META(item: RichActivityRow): ActionMeta {
  const tone: ActivityTone = item.action.includes("delete")
    ? "rose"
    : item.action.includes("create")
      ? "blue"
      : "slate"
  return {
    icon: AlertCircle,
    tone,
    title: () => item.action.replace(/[._]/g, " "),
    description: () => item.description,
    tooltip: () => item.action,
  }
}

function metaStr(
  m: Record<string, unknown> | null,
  key: string,
): string | null {
  const v = m?.[key]
  return typeof v === "string" ? v : null
}
function metaNum(
  m: Record<string, unknown> | null,
  key: string,
): number | null {
  const v = m?.[key]
  return typeof v === "number"
    ? v
    : typeof v === "string" && !isNaN(Number(v))
      ? Number(v)
      : null
}

function formatMoney(amount: number, currency = "DOP"): string {
  try {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(0)}`
  }
}

function timeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "ahora"
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `hace ${diffD}d`
  return date.toLocaleDateString("es-DO", { day: "numeric", month: "short" })
}
