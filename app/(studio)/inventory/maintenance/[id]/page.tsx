import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Wrench,
  Package as PackageIcon,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  DollarSign,
  AlertTriangle,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvMaintenanceById } from "@/server/services/inv-maintenance.service"
import { formatCurrency, formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { CompleteMaintenanceForm } from "./complete-maintenance-form"
import { MaintenanceActions } from "./maintenance-actions"

export const metadata: Metadata = { title: "Mantenimiento · Inventario" }

export default async function MaintenanceDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()

  const [record, unread] = await Promise.all([
    getInvMaintenanceById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])

  if (!record) notFound()

  const isActive =
    record.status === "pendiente" || record.status === "en_proceso"

  return (
    <>
      <AppTopbar
        eyebrow={`Inventario · Mantenimiento · ${record.code}`}
        title={
          record.item?.name ?? record.unit?.serial_number ?? "Sin equipo"
        }
        description={record.description ?? "Sin descripción"}
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/inventory/maintenance">
              <ArrowLeft className="mr-1 size-3.5" />
              Lista
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Status banner */}
        <StatusBanner status={record.status} code={record.code} />

        {/* Stats grid */}
        <section className="sf-card grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <Stat
            icon={<Wrench className="size-4" />}
            label="Tipo"
            value={typeLabel(record.type)}
          />
          <Stat
            icon={<DollarSign className="size-4" />}
            label="Costo"
            value={
              Number(record.cost) > 0
                ? formatCurrency(Number(record.cost))
                : "—"
            }
          />
          <Stat
            icon={<Calendar className="size-4" />}
            label="Inicio"
            value={
              record.start_date
                ? formatDate(new Date(record.start_date))
                : "—"
            }
          />
          <Stat
            icon={<Calendar className="size-4" />}
            label="Fin"
            value={
              record.end_date ? formatDate(new Date(record.end_date)) : "—"
            }
          />
        </section>

        {/* Equipo */}
        <section className="sf-card p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <PackageIcon className="mr-1 inline size-3.5" />
            Equipo
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <KV label="Item">
              {record.item?.name ? (
                <Link
                  href={`/inventory/items/${record.item.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {record.item.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </KV>
            <KV label="Marca">
              <span>{record.item?.brand ?? "—"}</span>
            </KV>
            <KV label="N/S unidad">
              {record.unit?.serial_number ? (
                <span className="font-mono text-xs">
                  {record.unit.serial_number}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </KV>
            <KV label="Código interno">
              {record.unit?.internal_code ? (
                <span className="font-mono text-xs">
                  {record.unit.internal_code}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </KV>
            <KV label="Técnico">
              <span>{record.technician ?? "—"}</span>
            </KV>
            <KV label="Próximo mantenimiento">
              <span>
                {record.next_maintenance_date
                  ? formatDate(new Date(record.next_maintenance_date))
                  : "—"}
              </span>
            </KV>
          </div>
        </section>

        {/* Notas */}
        {record.notes && (
          <section className="sf-card p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notas
            </h3>
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {record.notes}
            </p>
          </section>
        )}

        {/* Acciones */}
        {isActive && (
          <>
            <CompleteMaintenanceForm
              maintenanceId={record.id}
              defaultCost={Number(record.cost)}
            />
            <MaintenanceActions maintenanceId={record.id} />
          </>
        )}
      </main>
    </>
  )
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    preventivo: "Preventivo",
    correctivo: "Correctivo",
    limpieza: "Limpieza",
    revision: "Revisión",
    reparacion: "Reparación",
    calibracion: "Calibración",
    cambio_pieza: "Cambio pieza",
  }
  return labels[type] ?? type
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function KV({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function StatusBanner({ status, code }: { status: string; code: string }) {
  const map: Record<
    string,
    { label: string; cls: string; Icon: typeof CheckCircle2 }
  > = {
    pendiente: {
      label: "Pendiente · sin iniciar",
      cls: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
      Icon: Clock,
    },
    en_proceso: {
      label: "En proceso · unidad fuera de servicio",
      cls: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
      Icon: Wrench,
    },
    completado: {
      label: "Completado",
      cls: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
      Icon: CheckCircle2,
    },
    cancelado: {
      label: "Cancelado",
      cls: "bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-800",
      Icon: XCircle,
    },
  }
  const m = map[status] ?? map.pendiente
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${m.cls}`}
    >
      <m.Icon className="size-4 shrink-0" />
      <span>
        <strong className="font-mono">{code}</strong> — {m.label}
      </span>
    </div>
  )
}
