import Link from "next/link"
import { notFound } from "next/navigation"
import {
  Box,
  Edit,
  Tag,
  MapPin,
  Camera,
  CalendarDays,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  PackageCheck,
  PackageX,
  Wrench,
  Truck,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvItemById } from "@/server/services/inv-item.service"
import { getStockMovements } from "@/server/services/inv-stock-movement.service"
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Detalle de item · Inventario" }

// Mapeo movement_type → icon + color
const MOVEMENT_META: Record<
  string,
  { icon: LucideIcon; label: string; tone: "positive" | "negative" | "neutral" }
> = {
  entrada: { icon: TrendingUp, label: "Entrada", tone: "positive" },
  salida: { icon: TrendingDown, label: "Salida", tone: "negative" },
  prestamo: { icon: Truck, label: "Préstamo", tone: "neutral" },
  devolucion_prestamo: { icon: PackageCheck, label: "Devolución préstamo", tone: "positive" },
  renta: { icon: Truck, label: "Renta", tone: "neutral" },
  devolucion_renta: { icon: PackageCheck, label: "Devolución renta", tone: "positive" },
  mantenimiento: { icon: Wrench, label: "Mantenimiento", tone: "neutral" },
  ajuste: { icon: ArrowLeftRight, label: "Ajuste", tone: "neutral" },
  transferencia: { icon: ArrowLeftRight, label: "Transferencia", tone: "neutral" },
  baja: { icon: PackageX, label: "Baja", tone: "negative" },
  perdida: { icon: AlertTriangle, label: "Pérdida", tone: "negative" },
  dano: { icon: AlertTriangle, label: "Daño", tone: "negative" },
  reparacion: { icon: Wrench, label: "Reparación", tone: "neutral" },
}

export default async function InventoryItemDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const [item, movements, unread] = await Promise.all([
    getInvItemById(session.studioId, params.id),
    getStockMovements(session.studioId, {
      itemId: params.id,
      pageSize: 20,
    }),
    countUnreadNotifications(session.studioId),
  ])

  if (!item) notFound()

  const available =
    item.quantity_total -
    item.quantity_reserved -
    item.quantity_loaned -
    item.quantity_rented -
    item.quantity_maintenance -
    item.quantity_damaged -
    item.quantity_lost
  const isLow = item.quantity_total <= item.min_stock

  return (
    <>
      <AppTopbar
        eyebrow="Inventario"
        title={item.name}
        description={
          [item.brand, item.model].filter(Boolean).join(" · ") ||
          (item.kind === "serialized" ? "Item serializado" : "Item a granel")
        }
        unreadNotifications={unread}
        actions={
          <div className="flex items-center gap-2">
            <span
              className={
                item.kind === "serialized"
                  ? "inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              }
            >
              {item.kind === "serialized" ? "Serializado" : "A granel"}
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/inventory/items/${item.id}/edit`}>
                <Edit className="mr-1 size-3.5" />
                Editar
              </Link>
            </Button>
          </div>
        }
      />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Stock breakdown */}
        <section className="sf-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">
              Estado del stock
            </h2>
            {isLow && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                <AlertTriangle className="size-3" />
                Stock bajo
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <StockCell label="Total" value={item.quantity_total} tone="neutral" />
            <StockCell
              label="Disponible"
              value={available}
              tone={available <= 0 ? "danger" : available <= item.min_stock ? "warning" : "positive"}
            />
            <StockCell
              label="Prestado"
              value={item.quantity_loaned}
              tone={item.quantity_loaned > 0 ? "info" : "neutral"}
            />
            <StockCell
              label="Rentado"
              value={item.quantity_rented}
              tone={item.quantity_rented > 0 ? "info" : "neutral"}
            />
            <StockCell
              label="Mantenim."
              value={item.quantity_maintenance}
              tone={item.quantity_maintenance > 0 ? "warning" : "neutral"}
            />
            <StockCell
              label="Dañado"
              value={item.quantity_damaged}
              tone={item.quantity_damaged > 0 ? "danger" : "neutral"}
            />
            <StockCell
              label="Perdido"
              value={item.quantity_lost}
              tone={item.quantity_lost > 0 ? "danger" : "neutral"}
            />
          </div>

          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span>Stock min: <strong className="text-foreground">{item.min_stock}</strong></span>
            {item.max_stock != null && (
              <span>Stock max: <strong className="text-foreground">{item.max_stock}</strong></span>
            )}
            {item.internal_code && (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {item.internal_code}
              </code>
            )}
          </div>
        </section>

        {/* Detalles + Catálogo en 2 columnas */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="sf-card p-5 lg:col-span-1">
            <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Detalles
            </h3>
            <dl className="space-y-3 text-sm">
              <DetailRow icon={Tag} label="Categoría" value={item.category?.name} />
              <DetailRow
                icon={Tag}
                label="Subcategoría"
                value={item.subcategory?.name}
              />
              <DetailRow icon={Camera} label="Marca" value={item.brand} />
              <DetailRow icon={Camera} label="Modelo" value={item.model} />
              <DetailRow
                icon={MapPin}
                label="Ubicación por defecto"
                value={item.default_location?.name}
              />
              <DetailRow icon={Truck} label="Proveedor" value={item.provider} />
            </dl>

            {(item.default_purchase_price ||
              item.default_estimated_value ||
              item.default_rental_price_per_day) && (
              <>
                <h3 className="mb-3 mt-6 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Valores
                </h3>
                <dl className="space-y-2 text-sm">
                  {item.default_purchase_price != null && (
                    <PriceRow
                      label="Precio compra"
                      value={Number(item.default_purchase_price)}
                    />
                  )}
                  {item.default_estimated_value != null && (
                    <PriceRow
                      label="Valor estimado"
                      value={Number(item.default_estimated_value)}
                    />
                  )}
                  {item.default_rental_price_per_day != null && (
                    <PriceRow
                      label="Renta / día"
                      value={Number(item.default_rental_price_per_day)}
                    />
                  )}
                </dl>
              </>
            )}

            {item.description && (
              <>
                <h3 className="mb-2 mt-6 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Descripción
                </h3>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {item.description}
                </p>
              </>
            )}

            {item.notes && (
              <>
                <h3 className="mb-2 mt-6 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Notas internas
                </h3>
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {item.notes}
                </p>
              </>
            )}

            <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-[11px] text-muted-foreground">
              <span>Creado {formatDateShort(new Date(item.created_at))}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
              >
                <Trash2 className="mr-1 size-3" />
                Eliminar
              </Button>
            </div>
          </section>

          {/* Historial movimientos */}
          <section className="sf-card lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="font-display text-base font-semibold">
                  Historial de movimientos
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Ledger universal — append-only. Cada entrada es atómica.
                </p>
              </div>
              {movements.total > movements.items.length && (
                <Link
                  href={`/inventory/items/${item.id}/ledger`}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Ver completo ({movements.total})
                </Link>
              )}
            </div>

            {movements.total === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Sin movimientos registrados todavía.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {(movements.items as Array<{
                  id: string
                  type: string
                  quantity: number
                  reason: string | null
                  loan_id: string | null
                  rental_id: string | null
                  maintenance_id: string | null
                  created_at: string
                }>).map((m) => {
                  const meta = MOVEMENT_META[m.type] ?? {
                    icon: ArrowLeftRight,
                    label: m.type,
                    tone: "neutral" as const,
                  }
                  const Icon = meta.icon
                  const toneBg =
                    meta.tone === "positive"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                      : meta.tone === "negative"
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                      : "bg-muted text-muted-foreground"
                  return (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/30"
                    >
                      <span
                        className={"flex size-9 shrink-0 items-center justify-center rounded-md " + toneBg}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium">{meta.label}</p>
                          <span className="shrink-0 tabular-nums text-sm font-semibold">
                            ×{m.quantity}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {m.reason ?? "Sin nota"}
                          {m.loan_id && " · Préstamo asociado"}
                          {m.rental_id && " · Renta asociada"}
                          {m.maintenance_id && " · Mantenimiento asociado"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-[10px] text-muted-foreground">
                        <CalendarDays className="ml-auto size-3" />
                        <time dateTime={m.created_at}>
                          {formatDateShort(new Date(m.created_at))}
                        </time>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  )
}

// ---------------------------------------------------------------------------
// Helpers UI
// ---------------------------------------------------------------------------

function StockCell({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "positive" | "negative" | "neutral" | "warning" | "danger" | "info"
}) {
  const valueClass =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "info"
      ? "text-indigo-600 dark:text-indigo-400"
      : "text-foreground"

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={"mt-1 text-xl font-bold tabular-nums " + valueClass}>
        {value}
      </p>
    </div>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value?: string | null
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </dt>
        <dd className="truncate text-foreground">{value ?? "—"}</dd>
      </div>
    </div>
  )
}

function PriceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{formatCurrency(value, "DOP")}</span>
    </div>
  )
}
