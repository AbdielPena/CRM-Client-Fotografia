"use client"

import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  Printer,
  Clock3,
  CircleDashed,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Search,
  Send,
  Lock,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { PrintWhatsAppShare } from "@/components/galleries/print-whatsapp-share"
import type {
  StudioPrintItem,
  StudioPrintStatus,
} from "@/server/services/print-selection.service"

// ---------------------------------------------------------------------------
// Estilos por estado
// ---------------------------------------------------------------------------

const STATUS_META: Record<
  StudioPrintStatus,
  { label: string; cls: string; Icon: typeof Clock3 }
> = {
  pending: {
    label: "Sin seleccionar",
    cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    Icon: CircleDashed,
  },
  in_progress: {
    label: "En proceso",
    cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    Icon: Clock3,
  },
  selected: {
    label: "Seleccionado",
    cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  auto: {
    label: "Automática",
    cls: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    Icon: Sparkles,
  },
}

type TabKey = "pending" | "ready" | "all"

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "pending", label: "Pendientes" },
  { key: "ready", label: "Listas" },
  { key: "all", label: "Todas" },
]

function inTab(status: StudioPrintStatus, tab: TabKey): boolean {
  if (tab === "all") return true
  if (tab === "pending") return status === "pending" || status === "in_progress"
  return status === "selected" || status === "auto" // ready
}

function fmtDate(d: string | null): string {
  if (!d) return "Sin fecha"
  return new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("es-DO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

// ---------------------------------------------------------------------------
// Lista principal
// ---------------------------------------------------------------------------

export function PrintOverviewList({
  items,
  waPrintTemplate,
}: {
  items: StudioPrintItem[]
  waPrintTemplate: string
}) {
  const [tab, setTab] = React.useState<TabKey>("pending")
  const [q, setQ] = React.useState("")

  const counts = React.useMemo(() => {
    const c = { pending: 0, ready: 0, all: items.length }
    for (const it of items) {
      if (it.status === "pending" || it.status === "in_progress") c.pending += 1
      else c.ready += 1
    }
    return c
  }, [items])

  const query = q.trim().toLowerCase()
  const visible = items.filter((it) => {
    if (!inTab(it.status, tab)) return false
    if (!query) return true
    return (
      (it.clientName ?? "").toLowerCase().includes(query) ||
      it.galleryName.toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-5">
      {/* Filtros + búsqueda */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {TABS.map((t) => {
            const active = tab === t.key
            const n = counts[t.key]
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10.5px] tabular-nums",
                    active ? "bg-brand-foreground/20" : "bg-muted",
                  )}
                >
                  {n}
                </span>
              </button>
            )
          })}
        </div>

        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente o galería…"
            className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Printer className="mx-auto h-6 w-6 text-muted-foreground/50" />
          <p className="mt-3 text-[13.5px] font-medium text-foreground">
            {tab === "pending"
              ? "No hay impresiones pendientes"
              : "Nada por aquí"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">
            {query
              ? "Ningún resultado para tu búsqueda."
              : "Las impresiones aparecen aquí después de la entrega final de una sesión cuyo plan incluye impresos."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {visible.map((it) => (
              <PrintRow key={it.galleryId} item={it} waPrintTemplate={waPrintTemplate} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fila / tarjeta
// ---------------------------------------------------------------------------

export function PrintRow({
  item,
  waPrintTemplate,
}: {
  item: StudioPrintItem
  waPrintTemplate: string
}) {
  const [open, setOpen] = React.useState(false)
  const meta = STATUS_META[item.status]
  const StatusIcon = meta.Icon
  const manageHref = item.projectId
    ? `/projects/${item.projectId}`
    : `/galleries/${item.galleryId}`
  const needsClient = item.status === "pending" || item.status === "in_progress"

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16 }}
      className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_0_hsl(var(--border))] sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Cliente + galería + resumen */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-foreground">
              {item.clientName ?? "Cliente sin nombre"}
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                meta.cls,
              )}
            >
              <StatusIcon className="h-3 w-3" />
              {meta.label}
            </span>
            {item.locked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                <Lock className="h-3 w-3" /> Bloqueada
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            {item.galleryName} · entregada {fmtDate(item.deliveredDate)}
          </p>
          <p className="mt-1.5 text-[12px] text-foreground/80">{item.summary}</p>

          {/* Progreso de selección (solo si hay algo que elegir) */}
          {item.hasManual && (
            <p className="mt-1 text-[11.5px] tabular-nums text-muted-foreground">
              {item.selectedCount}/{item.manualTotal} foto
              {item.manualTotal === 1 ? "" : "s"} seleccionada
              {item.selectedCount === 1 ? "" : "s"}
              {item.status === "selected" && " · lista para producir"}
            </p>
          )}
          {!item.hasManual && (
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Se imprimen todas las fotos entregadas — sin selección del cliente.
            </p>
          )}
        </div>

        {/* Acciones */}
        <div className="flex shrink-0 items-center gap-2">
          {needsClient && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors",
                open
                  ? "bg-brand text-brand-foreground"
                  : "border border-border text-foreground hover:bg-muted",
              )}
            >
              <Send className="h-3.5 w-3.5" />
              {open ? "Cerrar" : "Enviar link"}
            </button>
          )}
          <Link
            href={manageHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Gestionar
          </Link>
        </div>
      </div>

      {/* Panel de envío por WhatsApp */}
      <AnimatePresence initial={false}>
        {open && needsClient && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <PrintWhatsAppShare
              token={item.publicToken}
              galleryName={item.galleryName}
              clientName={item.clientName}
              clientPhone={item.clientPhone}
              template={waPrintTemplate}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
