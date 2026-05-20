import Link from "next/link"
import {
  Boxes,
  Truck,
  PackageCheck,
  Wrench,
  AlertTriangle,
  TrendingUp,
  CalendarClock,
  ArrowRight,
  Plus,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvItems } from "@/server/services/inv-item.service"
import { getInvLoans } from "@/server/services/inv-loan.service"
import { getInvRentals } from "@/server/services/inv-rental.service"
import { getStockMovements } from "@/server/services/inv-stock-movement.service"
import { formatCurrency, formatDate, relativeTime } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Inventario · Dashboard" }

export default async function InventoryDashboardPage() {
  const session = await requireStudioAuth()

  const [items, loans, rentals, recentMovements, unread] = await Promise.all([
    getInvItems(session.studioId, { pageSize: 1000, activeOnly: true }),
    getInvLoans(session.studioId, { status: "activo", pageSize: 10 }),
    getInvRentals(session.studioId, { status: "activa", pageSize: 10 }),
    getStockMovements(session.studioId, { pageSize: 8 }),
    countUnreadNotifications(session.studioId),
  ])

  // KPIs
  const totalItems = items.total
  const lowStock = items.items.filter((it) => it.quantity_total <= it.min_stock).length
  const totalLoaned = items.items.reduce((acc, it) => acc + it.quantity_loaned, 0)
  const totalRented = items.items.reduce((acc, it) => acc + it.quantity_rented, 0)
  const totalMaintenance = items.items.reduce(
    (acc, it) => acc + it.quantity_maintenance,
    0,
  )
  const totalDamaged = items.items.reduce((acc, it) => acc + it.quantity_damaged, 0)

  // Revenue de rentals activas (sum total - balance pendiente)
  const activeRentalsRevenue = rentals.items.reduce(
    (acc, r) => acc + Number(r.paid_amount ?? 0),
    0,
  )

  return (
    <>
      <AppTopbar
        eyebrow="Inventario"
        title="Dashboard del inventario"
        description="Resumen de equipos, préstamos activos y movimientos recientes."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/inventory/items/new">
              <Plus className="mr-1 size-4" />
              Nuevo item
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* KPIs grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            label="Items totales"
            value={totalItems}
            icon={<Boxes className="size-4" />}
            tone="neutral"
            href="/inventory/items"
          />
          <KpiCard
            label="Stock bajo"
            value={lowStock}
            icon={<AlertTriangle className="size-4" />}
            tone={lowStock > 0 ? "warning" : "neutral"}
            href="/inventory/items?lowStock=1"
          />
          <KpiCard
            label="Prestados"
            value={totalLoaned}
            icon={<PackageCheck className="size-4" />}
            tone={totalLoaned > 0 ? "info" : "neutral"}
            href="/inventory/loans?status=activo"
          />
          <KpiCard
            label="Rentados"
            value={totalRented}
            icon={<Truck className="size-4" />}
            tone={totalRented > 0 ? "info" : "neutral"}
            href="/inventory/rentals?status=activa"
          />
          <KpiCard
            label="Mantenim."
            value={totalMaintenance}
            icon={<Wrench className="size-4" />}
            tone={totalMaintenance > 0 ? "warning" : "neutral"}
          />
          <KpiCard
            label="Dañados"
            value={totalDamaged}
            icon={<AlertTriangle className="size-4" />}
            tone={totalDamaged > 0 ? "danger" : "neutral"}
          />
        </div>

        {/* Revenue card si hay rentas */}
        {activeRentalsRevenue > 0 && (
          <div className="sf-card flex items-center justify-between p-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Cobrado en rentas activas
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatCurrency(activeRentalsRevenue)}
              </p>
            </div>
            <TrendingUp className="size-8 text-emerald-500" />
          </div>
        )}

        {/* 2 columnas: rentals/loans activas + movements recientes */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Operaciones activas */}
          <section className="sf-card lg:col-span-2">
            <div className="border-b border-border p-4">
              <h2 className="font-display text-base font-semibold">
                Operaciones activas
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Préstamos y rentas que aún están en curso
              </p>
            </div>

            <div className="divide-y divide-border">
              {/* Rentals activas */}
              {rentals.items.length === 0 && loans.items.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Sin operaciones activas. Todo el equipo está disponible.
                </div>
              ) : (
                <>
                  {rentals.items.slice(0, 5).map((r) => (
                    <Link
                      key={r.id}
                      href={`/inventory/rentals/${r.id}`}
                      className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent/30"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                          <Truck className="size-4" />
                        </span>
                        <div>
                          <p className="text-sm font-medium">
                            {r.code} — {r.client?.name ?? "—"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Renta · vence {formatDate(new Date(r.end_date))}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatCurrency(Number(r.balance ?? 0))} pend.
                      </span>
                    </Link>
                  ))}
                  {loans.items.slice(0, 5).map((l) => {
                    const overdue = new Date(l.expected_return_date) < new Date()
                    return (
                      <Link
                        key={l.id}
                        href={`/inventory/loans/${l.id}`}
                        className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent/30"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 items-center justify-center rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                            <PackageCheck className="size-4" />
                          </span>
                          <div>
                            <p className="text-sm font-medium">
                              {l.code} — {l.responsible?.full_name ?? "—"}
                            </p>
                            <p
                              className={
                                "text-[11px] " +
                                (overdue ? "text-red-600 font-medium" : "text-muted-foreground")
                              }
                            >
                              {overdue && (
                                <AlertTriangle className="mr-1 inline size-3" />
                              )}
                              Préstamo · esperado {formatDate(new Date(l.expected_return_date))}
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="size-3 text-muted-foreground" />
                      </Link>
                    )
                  })}
                </>
              )}
            </div>

            <div className="flex items-center justify-around border-t border-border p-2 text-xs">
              <Link
                href="/inventory/rentals"
                className="px-3 py-1 text-muted-foreground hover:text-foreground"
              >
                Ver rentas
              </Link>
              <Link
                href="/inventory/loans"
                className="px-3 py-1 text-muted-foreground hover:text-foreground"
              >
                Ver préstamos
              </Link>
            </div>
          </section>

          {/* Movements recientes */}
          <section className="sf-card lg:col-span-1">
            <div className="border-b border-border p-4">
              <h2 className="font-display text-base font-semibold">
                Movimientos recientes
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Ledger universal append-only
              </p>
            </div>

            {recentMovements.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Sin movimientos aún
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {(recentMovements.items as Array<{
                  id: string
                  type: string
                  quantity: number
                  reason: string | null
                  created_at: string
                }>).map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        {m.type}
                        <span className="ml-1.5 tabular-nums text-muted-foreground">
                          ×{m.quantity}
                        </span>
                      </p>
                      {m.reason && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {m.reason}
                        </p>
                      )}
                    </div>
                    <time
                      dateTime={m.created_at}
                      className="shrink-0 text-[10px] text-muted-foreground"
                    >
                      {relativeTime(m.created_at)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  )
}

function KpiCard({
  label,
  value,
  icon,
  tone,
  href,
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone: "positive" | "warning" | "neutral" | "info" | "danger"
  href?: string
}) {
  const valueClass =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "info"
      ? "text-indigo-600 dark:text-indigo-400"
      : "text-foreground"
  const iconClass =
    tone === "danger"
      ? "text-red-500"
      : tone === "warning"
      ? "text-amber-500"
      : tone === "info"
      ? "text-indigo-500"
      : tone === "positive"
      ? "text-emerald-500"
      : "text-muted-foreground"

  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={iconClass}>{icon}</span>
      </div>
      <p className={"mt-2 text-2xl font-bold tabular-nums " + valueClass}>{value}</p>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="sf-card block p-4 transition-shadow hover:shadow-md"
      >
        {content}
      </Link>
    )
  }

  return <div className="sf-card p-4">{content}</div>
}
