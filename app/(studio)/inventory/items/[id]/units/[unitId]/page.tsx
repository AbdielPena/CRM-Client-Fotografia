import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Package as PackageIcon,
  QrCode,
  Barcode,
  MapPin,
  Calendar,
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  Wrench,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvItemUnitById } from "@/server/services/inv-item-unit.service"
import { untypedServer } from "@/server/supabase/untyped"
import { formatCurrency, formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { ReportLossActions } from "./report-loss-actions"

export const metadata: Metadata = { title: "Unidad · Inventario" }

const STATUS_TONE: Record<string, string> = {
  disponible:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  reservado: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  prestado:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  rentado:
    "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  mantenimiento:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  danado: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  perdido: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  retirado: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-500",
}

export default async function ItemUnitDetailPage({
  params,
}: {
  params: { id: string; unitId: string }
}) {
  const session = await requireStudioAuth()

  const [unit, unread] = await Promise.all([
    getInvItemUnitById(session.studioId, params.unitId),
    countUnreadNotifications(session.studioId),
  ])

  if (!unit) notFound()

  // Fetch últimos 10 movimientos del ledger para esta unidad
  const sb = untypedServer()
  const { data: movementsData } = await sb
    .from("inv_stock_movements")
    .select(
      `id, type, quantity, reason, occurred_at,
       loan:inv_loans(id, code),
       rental:inv_rentals(id, code),
       maintenance:inv_maintenance_records(id, code)`,
    )
    .eq("studio_id", session.studioId)
    .eq("item_unit_id", params.unitId)
    .order("occurred_at", { ascending: false })
    .limit(10)

  const movements = (movementsData ?? []) as Array<{
    id: string
    type: string
    quantity: number
    reason: string | null
    occurred_at: string
    loan?: { id: string; code: string } | null
    rental?: { id: string; code: string } | null
    maintenance?: { id: string; code: string } | null
  }>

  type ItemRef = { id: string; name: string; kind: string; brand: string | null; model: string | null }
  type LocRef = { id: string; name: string }
  const item = unit.item as ItemRef | null | undefined
  const location = unit.location as LocRef | null | undefined

  const warrantyExpired =
    unit.warranty_expiry &&
    new Date(unit.warranty_expiry) < new Date()
  const warrantyActive =
    unit.warranty_expiry &&
    new Date(unit.warranty_expiry) >= new Date()

  return (
    <>
      <AppTopbar
        eyebrow={`Inventario · ${item?.name ?? "Item"}`}
        title={unit.serial_number ?? unit.internal_code ?? "Unidad sin N/S"}
        description={
          [item?.brand, item?.model].filter(Boolean).join(" ") ||
          "Unidad serializada"
        }
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/inventory/items/${params.id}/units`}>
              <ArrowLeft className="mr-1 size-3.5" />
              Unidades
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Status banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className={
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider " +
                (STATUS_TONE[unit.status] ?? "bg-muted text-foreground")
              }
            >
              {unit.status}
            </span>
            {item && (
              <Link
                href={`/inventory/items/${item.id}`}
                className="text-sm text-primary hover:underline"
              >
                <PackageIcon className="mr-1 inline size-3.5" />
                {item.name}
              </Link>
            )}
          </div>
          {unit.status === "disponible" && (
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/inventory/maintenance/new?itemId=${params.id}&itemUnitId=${unit.id}`}
              >
                <Wrench className="mr-1 size-3.5" />
                Llevar a mantenimiento
              </Link>
            </Button>
          )}
        </div>

        {/* Identificación */}
        <section className="sf-card p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Identificación
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KV label="N/S">
              <span className="font-mono text-xs">
                {unit.serial_number ?? "—"}
              </span>
            </KV>
            <KV label="Código interno">
              <span className="font-mono text-xs">
                {unit.internal_code ?? "—"}
              </span>
            </KV>
            <KV label="QR">
              <span className="inline-flex items-center gap-1 font-mono text-xs">
                {unit.qr_code && <QrCode className="size-3" />}
                {unit.qr_code ?? "—"}
              </span>
            </KV>
            <KV label="Barcode">
              <span className="inline-flex items-center gap-1 font-mono text-xs">
                {unit.barcode && <Barcode className="size-3" />}
                {unit.barcode ?? "—"}
              </span>
            </KV>
          </div>
        </section>

        {/* Condición + ubicación */}
        <section className="sf-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <KV label="Condición física">
            <span>{unit.physical_condition ?? "—"}</span>
          </KV>
          <KV label="Condición operativa">
            <span>{unit.operational_condition ?? "—"}</span>
          </KV>
          <KV label={<><MapPin className="mr-1 inline size-3" />Ubicación</>}>
            <span>{location?.name ?? "—"}</span>
          </KV>
        </section>

        {/* Compra + garantía */}
        <section className="sf-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-4">
          <KV
            label={
              <>
                <Calendar className="mr-1 inline size-3" />
                Comprado
              </>
            }
          >
            <span>
              {unit.purchase_date
                ? formatDate(new Date(unit.purchase_date))
                : "—"}
            </span>
          </KV>
          <KV
            label={
              <>
                <DollarSign className="mr-1 inline size-3" />
                Precio compra
              </>
            }
          >
            <span className="tabular-nums">
              {unit.purchase_price
                ? formatCurrency(Number(unit.purchase_price))
                : "—"}
            </span>
          </KV>
          <KV label="Valor estimado">
            <span className="tabular-nums">
              {unit.estimated_value
                ? formatCurrency(Number(unit.estimated_value))
                : "—"}
            </span>
          </KV>
          <KV
            label={
              <>
                <ShieldCheck className="mr-1 inline size-3" />
                Garantía
              </>
            }
          >
            {unit.warranty_expiry ? (
              warrantyActive ? (
                <span className="text-emerald-600">
                  Activa hasta{" "}
                  {formatDate(new Date(unit.warranty_expiry))}
                </span>
              ) : (
                <span className="text-red-600">
                  <AlertTriangle className="mr-1 inline size-3" />
                  Vencida{" "}
                  {formatDate(new Date(unit.warranty_expiry))}
                </span>
              )
            ) : (
              <span>—</span>
            )}
          </KV>
        </section>

        {unit.provider && (
          <section className="sf-card p-5">
            <KV label="Proveedor">
              <span>{unit.provider}</span>
            </KV>
          </section>
        )}

        {/* Notas */}
        {unit.notes && (
          <section className="sf-card p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notas
            </h3>
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {unit.notes}
            </p>
          </section>
        )}

        {/* Movimientos */}
        {movements.length > 0 && (
          <section className="sf-card p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Últimos movimientos ({movements.length})
            </h3>
            <ul className="divide-y divide-border">
              {movements.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <p>
                      <span className="font-medium">{m.type}</span>
                      {m.reason && (
                        <span className="ml-2 text-muted-foreground">
                          · {m.reason}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(m.occurred_at).toLocaleString("es-DO")}
                    </p>
                  </div>
                  <div className="text-right">
                    {m.loan && (
                      <Link
                        href={`/inventory/loans/${m.loan.id}`}
                        className="font-mono text-[10px] text-primary hover:underline"
                      >
                        {m.loan.code}
                      </Link>
                    )}
                    {m.rental && (
                      <Link
                        href={`/inventory/rentals/${m.rental.id}`}
                        className="font-mono text-[10px] text-primary hover:underline"
                      >
                        {m.rental.code}
                      </Link>
                    )}
                    {m.maintenance && (
                      <Link
                        href={`/inventory/maintenance/${m.maintenance.id}`}
                        className="font-mono text-[10px] text-primary hover:underline"
                      >
                        {m.maintenance.code}
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Reportar pérdida / daño */}
        {["disponible", "danado"].includes(unit.status) && (
          <ReportLossActions unitId={unit.id} currentStatus={unit.status} />
        )}
      </main>
    </>
  )
}

function KV({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}
