import Link from "next/link"
import { Printer } from "lucide-react"

import type { StudioPrintItem } from "@/server/services/print-selection.service"

/**
 * "Impresiones pendientes" del dashboard.
 *
 * Solo las que están esperando algo del cliente: `pending` (ni empezó) e
 * `in_progress` (empezó a elegir y no envió). Las ya enviadas viven en
 * /impresiones, aquí solo importa lo que está trabado.
 */
export function PendingPrintsList({ items }: { items: StudioPrintItem[] }) {
  if (items.length === 0) {
    return (
      <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">
        Ninguna impresión pendiente de selección.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border/40">
      {items.map((p) => (
        <li key={p.galleryId}>
          <Link
            href="/impresiones"
            className="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-muted/40"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Printer className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {p.clientName ?? p.galleryName}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {p.summary}
                </p>
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                p.status === "in_progress"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {p.status === "in_progress"
                ? `${p.selectedCount}/${p.manualTotal} elegidas`
                : "Sin elegir"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
