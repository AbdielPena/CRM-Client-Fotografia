import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Plus,
  Package as PackageIcon,
  QrCode,
  Barcode,
  MapPin,
  AlertTriangle,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvItemById } from "@/server/services/inv-item.service"
import { getInvItemUnits } from "@/server/services/inv-item-unit.service"
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableColumn,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table"

export const metadata: Metadata = { title: "Unidades · Inventario" }

export default async function InventoryItemUnitsPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { status?: string }
}) {
  const session = await requireStudioAuth()

  const item = await getInvItemById(session.studioId, params.id)
  if (!item) notFound()

  if (item.kind !== "serialized") {
    // Items bulk no tienen unidades — redirect a items detail
    return (
      <>
        <AppTopbar
          eyebrow="Inventario"
          title="No aplica"
          description="Este item es a granel — no tiene unidades serializadas individuales."
        />
        <main className="mx-auto max-w-2xl px-4 py-12">
          <EmptyState
            icon={<PackageIcon className="size-12 text-muted-foreground/60" />}
            title="Item kind = bulk"
            description="Solo items kind=serialized tienen unidades individuales con N/S. Items bulk usan contador agregado."
          >
            <Button asChild>
              <Link href={`/inventory/items/${params.id}`}>
                <ArrowLeft className="mr-1 size-4" />
                Volver al item
              </Link>
            </Button>
          </EmptyState>
        </main>
      </>
    )
  }

  const validStatus = [
    "disponible",
    "reservado",
    "prestado",
    "rentado",
    "mantenimiento",
    "danado",
    "perdido",
    "retirado",
  ] as const
  const status = validStatus.includes(searchParams?.status as (typeof validStatus)[number])
    ? (searchParams!.status as (typeof validStatus)[number])
    : undefined

  const [units, unread] = await Promise.all([
    getInvItemUnits(session.studioId, params.id, { status, pageSize: 100 }),
    countUnreadNotifications(session.studioId),
  ])

  // KPIs por status
  const statusCounts = units.items.reduce<Record<string, number>>((acc, u) => {
    acc[u.status] = (acc[u.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <>
      <AppTopbar
        eyebrow="Inventario / Items"
        title={`Unidades de ${item.name}`}
        description={`${item.kind === "serialized" ? "Serializadas" : ""} · ${units.total} unidades registradas`}
        unreadNotifications={unread}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/inventory/items/${params.id}`}>
                <ArrowLeft className="mr-1 size-3.5" />
                Item
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/inventory/items/${params.id}/units/new`}>
                <Plus className="mr-1 size-4" />
                Nueva unidad
              </Link>
            </Button>
          </div>
        }
      />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* KPIs por status */}
        {units.items.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {validStatus.map((st) => (
              <StatusKpi
                key={st}
                label={st}
                count={statusCounts[st] ?? 0}
                href={
                  status === st
                    ? `/inventory/items/${params.id}/units`
                    : `/inventory/items/${params.id}/units?status=${st}`
                }
                active={status === st}
              />
            ))}
          </div>
        )}

        {units.total === 0 ? (
          <EmptyState
            icon={<PackageIcon className="size-12 text-muted-foreground/60" />}
            title="Sin unidades registradas"
            description="Agrega cada cámara/lente/equipo individual con su N/S y QR code."
          >
            <Button asChild>
              <Link href={`/inventory/items/${params.id}/units/new`}>
                <Plus className="mr-1 size-4" />
                Agregar primera unidad
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableColumn>N/S</DataTableColumn>
                <DataTableColumn>Código interno</DataTableColumn>
                <DataTableColumn>QR / Barcode</DataTableColumn>
                <DataTableColumn>Ubicación</DataTableColumn>
                <DataTableColumn>Estado</DataTableColumn>
                <DataTableColumn className="text-right">Valor</DataTableColumn>
                <DataTableColumn>Adquirido</DataTableColumn>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {units.items.map((u) => {
                const warrantyExpired =
                  u.warranty_expiry &&
                  new Date(u.warranty_expiry) < new Date()
                return (
                  <DataTableRow key={u.id} className="hover:bg-accent/30">
                    <DataTableCell>
                      <Link
                        href={`/inventory/items/${params.id}/units/${u.id}`}
                        className="font-mono text-xs font-semibold hover:underline"
                      >
                        {u.serial_number ?? "(sin N/S)"}
                      </Link>
                    </DataTableCell>
                    <DataTableCell className="font-mono text-xs">
                      {u.internal_code ?? "—"}
                    </DataTableCell>
                    <DataTableCell className="text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {u.qr_code && (
                          <span className="inline-flex items-center gap-0.5">
                            <QrCode className="size-3" />
                            {u.qr_code.slice(0, 8)}
                          </span>
                        )}
                        {u.barcode && (
                          <span className="inline-flex items-center gap-0.5">
                            <Barcode className="size-3" />
                            {u.barcode}
                          </span>
                        )}
                        {!u.qr_code && !u.barcode && "—"}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-xs text-muted-foreground">
                      {u.location?.name ?? "—"}
                    </DataTableCell>
                    <DataTableCell>
                      <StatusPill status={u.status} />
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums text-muted-foreground">
                      {u.estimated_value
                        ? formatCurrency(Number(u.estimated_value))
                        : "—"}
                      {warrantyExpired && (
                        <p
                          className="mt-0.5 text-[9px] text-red-600"
                          title="Garantía vencida"
                        >
                          <AlertTriangle className="mr-1 inline size-3" />
                          Sin garantía
                        </p>
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-xs text-muted-foreground">
                      {u.purchase_date
                        ? formatDateShort(new Date(u.purchase_date))
                        : "—"}
                    </DataTableCell>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTable>
        )}
      </main>
    </>
  )
}

function StatusKpi({
  label,
  count,
  href,
  active,
}: {
  label: string
  count: number
  href: string
  active: boolean
}) {
  const tone =
    label === "danado" || label === "perdido" || label === "retirado"
      ? "danger"
      : label === "disponible"
      ? "positive"
      : label === "mantenimiento"
      ? "warning"
      : "neutral"

  const colorClass =
    active
      ? "border-primary bg-primary text-primary-foreground"
      : tone === "positive" && count > 0
      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950"
      : tone === "danger" && count > 0
      ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950"
      : tone === "warning" && count > 0
      ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
      : "border-input bg-card"

  return (
    <Link
      href={href}
      className={
        "block rounded-xl border p-3 text-center transition-colors hover:shadow-sm " +
        colorClass
      }
    >
      <p className="text-[9px] uppercase font-medium tracking-wider opacity-80">
        {label.replace("_", " ")}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums">{count}</p>
    </Link>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    disponible: {
      label: "Disponible",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    reservado: {
      label: "Reservado",
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    },
    prestado: {
      label: "Prestado",
      cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    },
    rentado: {
      label: "Rentado",
      cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    },
    mantenimiento: {
      label: "Mantenim.",
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    },
    danado: {
      label: "Dañado",
      cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    },
    perdido: {
      label: "Perdido",
      cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    },
    retirado: {
      label: "Retirado",
      cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
    },
  }
  const m = map[status] ?? map.disponible
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  )
}
