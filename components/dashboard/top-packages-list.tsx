"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Package } from "lucide-react"
import { formatCurrency } from "@/lib/utils/currency"

type TopPackage = {
  packageId: string
  name: string
  bookings: number
  revenue: number
}

type Props = {
  items: TopPackage[]
  currency?: string
}

export function TopPackagesList({ items, currency = "DOP" }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Package className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-body-sm text-muted-foreground">
          Sin paquetes vendidos todavía
        </p>
      </div>
    )
  }

  const max = Math.max(1, ...items.map((i) => i.bookings))

  return (
    <div className="space-y-3.5">
      {items.map((item, idx) => {
        const pct = (item.bookings / max) * 100
        const tooltip = `${item.name} — ${item.bookings} proyectos · ${formatCurrency(item.revenue, currency)}`
        return (
          <Link
            key={item.packageId}
            href={`/projects?package=${item.packageId}`}
            title={tooltip}
            className="group block rounded-md transition-colors hover:bg-muted/30 -mx-2 px-2 py-1"
          >
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold text-muted-foreground tabular-nums">
                  {idx + 1}
                </span>
                <span className="truncate text-body-sm text-foreground group-hover:text-brand transition-colors">
                  {item.name}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                <span className="text-caption text-muted-foreground tabular-nums">
                  {item.bookings}
                  {item.bookings === 1 ? " proyecto" : " proyectos"}
                </span>
                <span className="min-w-[80px] text-right text-caption font-semibold text-foreground tabular-nums">
                  {formatCurrency(item.revenue, currency)}
                </span>
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pct, 3)}%` }}
                transition={{
                  duration: 0.6,
                  delay: idx * 0.05,
                  ease: [0.32, 0.72, 0, 1],
                }}
                className="h-full rounded-full bg-aurora"
              />
            </div>
          </Link>
        )
      })}
    </div>
  )
}
