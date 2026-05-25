import Link from "next/link"
import {
  Wrench,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvMaintenanceRecords } from "@/server/services/inv-maintenance.service"
import { formatCurrency, formatDate } from "@/lib/utils/currency"

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

export const metadata: Metadata = { title: "Inventario · Mantenimiento" }

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams?: { status?: string; type?: string }
}) {
  const session = await requireStudioAuth()
  const validStatus = ["pendiente", "en_proceso", "completado", "cancelado"] as const
  const status = validStatus.includes(searchParams?.status as (typeof validStatus)[number])
    ? (searchParams!.status as (typeof validStatus)[number])
    : undefined

  const [records, unread] = await Promise.all([
    getInvMaintenanceRecords(session.studioId, { status, pageSize: 100 }),
    countUnreadNotifications(session.studioId),
  ])

  const pendings = records.items.filter(
    (r) => r.status === "pendiente" || r.status === "en_proceso",
  ).length
  const totalCost = records.items.reduce((acc, r) => acc + Number(r.cost ?? 0), 0)

  return (
    <>
      <AppTopbar
        eyebrow="Inventario"
        title="Mantenimiento"
        description="Registros de reparaciones, calibraciones y mantenimientos preventivos."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/inventory/maintenance/new">
              <Plus className="mr-1 size-4" />
              Registrar mantenimiento
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {records.items.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              label="Total registros"
              value={records.total}
              isInt
              icon={<Wrench className="size-4" />}
              tone="neutral"
            />
            <KpiCard
              label="Pendientes/En proceso"
              value={pendings}
              isInt
              icon={<Clock className="size-4" />}
              tone={pendings > 0 ? "warning" : "neutral"}
            />
            <KpiCard
              label="Costo acumulado"
              value={totalCost}
              icon={<Wrench className="size-4" />}
              tone="neutral"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            href={
              status === "pendiente"
                ? "/inventory/maintenance"
                : "/inventory/maintenance?status=pendiente"
            }
            active={status === "pendiente"}
            label="Pendientes"
          />
          <FilterChip
            href={
              status === "en_proceso"
                ? "/inventory/maintenance"
                : "/inventory/maintenance?status=en_proceso"
            }
            active={status === "en_proceso"}
            label="En proceso"
          />
          <FilterChip
            href={
              status === "completado"
                ? "/inventory/maintenance"
                : "/inventory/maintenance?status=completado"
            }
            active={status === "completado"}
            label="Completados"
          />
        </div>

        {records.total === 0 ? (
          <EmptyState
            icon={<Wrench className="size-12 text-muted-foreground/60" />}
            title="Sin registros de mantenimiento"
            description="Cuando un equipo necesite reparación, calibración o limpieza, regístralo aquí."
          >
            <Button asChild>
              <Link href="/inventory/maintenance/new">
                <Plus className="mr-1 size-4" />
                Registrar primero
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableColumn>Código</DataTableColumn>
                <DataTableColumn>Equipo</DataTableColumn>
                <DataTableColumn>Tipo</DataTableColumn>
                <DataTableColumn>Técnico</DataTableColumn>
                <DataTableColumn className="text-right">Costo</DataTableColumn>
                <DataTableColumn>Inicio</DataTableColumn>
                <DataTableColumn>Estado</DataTableColumn>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {records.items.map((m) => (
                <DataTableRow key={m.id} className="hover:bg-accent/30">
                  <DataTableCell>
                    <Link
                      href={`/inventory/maintenance/${m.id}`}
                      className="font-mono text-xs font-semibold hover:underline"
                    >
                      {m.code}
                    </Link>
                  </DataTableCell>
                  <DataTableCell className="text-sm">
                    {m.item?.name ?? m.unit?.serial_number ?? "—"}
                  </DataTableCell>
                  <DataTableCell>
                    <TypeBadge type={m.type} />
                  </DataTableCell>
                  <DataTableCell className="text-xs text-muted-foreground">
                    {m.technician ?? "—"}
                  </DataTableCell>
                  <DataTableCell className="text-right tabular-nums">
                    {Number(m.cost) > 0 ? formatCurrency(Number(m.cost)) : "—"}
                  </DataTableCell>
                  <DataTableCell className="text-xs text-muted-foreground">
                    {m.start_date
                      ? formatDate(new Date(m.start_date))
                      : "—"}
                  </DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={m.status} />
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </main>
    </>
  )
}

function KpiCard({
  label,
  value,
  tone,
  icon,
  isInt,
}: {
  label: string
  value: number
  tone: "warning" | "neutral"
  icon: React.ReactNode
  isInt?: boolean
}) {
  const iconClass = tone === "warning" ? "text-amber-500" : "text-muted-foreground"
  return (
    <div className="sf-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={iconClass}>{icon}</span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums">
        {isInt ? value : formatCurrency(value)}
      </p>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    preventivo: "Preventivo",
    correctivo: "Correctivo",
    limpieza: "Limpieza",
    revision: "Revisión",
    reparacion: "Reparación",
    calibracion: "Calibración",
    cambio_pieza: "Cambio pieza",
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
      {labels[type] ?? type}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    pendiente: { label: "Pendiente", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", Icon: Clock },
    en_proceso: { label: "En proceso", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", Icon: Wrench },
    completado: { label: "Completado", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", Icon: CheckCircle2 },
    cancelado: { label: "Cancelado", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500", Icon: XCircle },
  }
  const m = map[status] ?? map.pendiente
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${m.cls}`}>
      <m.Icon className="size-3" />
      {m.label}
    </span>
  )
}

function FilterChip({
  href,
  active,
  label,
}: {
  href: string
  active: boolean
  label: string
}) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-accent")
      }
    >
      {label}
    </Link>
  )
}
