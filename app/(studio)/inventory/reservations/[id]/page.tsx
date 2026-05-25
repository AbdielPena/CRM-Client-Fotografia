import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  CalendarClock,
  Package as PackageIcon,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Truck,
  PackageCheck,
  Clock,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvReservationById } from "@/server/services/inv-reservation.service"
import { formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { ReservationActions } from "./reservation-actions"

export const metadata: Metadata = { title: "Reserva · Inventario" }

export default async function ReservationDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()

  const [reservation, unread] = await Promise.all([
    getInvReservationById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])

  if (!reservation) notFound()

  const isOverdue =
    reservation.status === "pendiente" &&
    new Date(reservation.end_date) < new Date()
  const effectiveStatus = isOverdue ? "vencida" : reservation.status

  const canManage =
    effectiveStatus === "pendiente" || effectiveStatus === "confirmada"

  return (
    <>
      <AppTopbar
        eyebrow={`Inventario · Reservas · ${reservation.code}`}
        title={
          reservation.client?.name ??
          reservation.responsible?.full_name ??
          "Sin destinatario"
        }
        description={`${formatDate(new Date(reservation.start_date))} → ${formatDate(new Date(reservation.end_date))}`}
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/inventory/reservations">
              <ArrowLeft className="mr-1 size-3.5" />
              Reservas
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Status banner */}
        <StatusBanner status={effectiveStatus} reservation={reservation} />

        {/* Detalle de quién y cuándo */}
        <section className="sf-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <DetailItem
            icon={<User className="size-4" />}
            label={reservation.client ? "Cliente" : "Responsible"}
            value={
              reservation.client?.name ??
              reservation.responsible?.full_name ??
              "—"
            }
            sub={
              reservation.responsible?.department ??
              reservation.client?.email ??
              null
            }
          />
          <DetailItem
            icon={<CalendarClock className="size-4" />}
            label="Inicio"
            value={formatDate(new Date(reservation.start_date))}
            sub={new Date(reservation.start_date).toLocaleTimeString("es-DO", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
          <DetailItem
            icon={<CalendarClock className="size-4" />}
            label="Fin"
            value={formatDate(new Date(reservation.end_date))}
            sub={new Date(reservation.end_date).toLocaleTimeString("es-DO", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
        </section>

        {/* Razón */}
        {reservation.reason && (
          <section className="sf-card p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Razón
            </h3>
            <p className="text-sm">{reservation.reason}</p>
          </section>
        )}

        {/* Items reservados */}
        <section className="sf-card p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <PackageIcon className="mr-1 inline size-3.5" />
            Equipos reservados ({reservation.items?.length ?? 0})
          </h3>
          {(reservation.items ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay items registrados en esta reserva.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {reservation.items!.map((line) => (
                <li
                  key={line.id}
                  className="flex items-center justify-between py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {line.item?.name ?? "—"}
                      {line.item?.brand && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {line.item.brand}
                        </span>
                      )}
                    </p>
                    {line.unit?.serial_number && (
                      <p className="font-mono text-[10px] text-muted-foreground">
                        N/S: {line.unit.serial_number}
                        {line.unit.internal_code &&
                          ` · ${line.unit.internal_code}`}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm tabular-nums">
                      Cant: <strong>{line.quantity}</strong>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Acciones */}
        {canManage && (
          <ReservationActions
            reservationId={reservation.id}
            isOverdue={isOverdue}
            currentStatus={reservation.status}
          />
        )}

        {/* Conversión info si ya se convirtió */}
        {(reservation.converted_to_loan_id ||
          reservation.converted_to_rental_id) && (
          <section className="sf-card p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Convertida a operación
            </h3>
            {reservation.converted_to_loan_id && (
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/inventory/loans/${reservation.converted_to_loan_id}`}
                >
                  <PackageCheck className="mr-1 size-3.5" />
                  Ver préstamo
                </Link>
              </Button>
            )}
            {reservation.converted_to_rental_id && (
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/inventory/rentals/${reservation.converted_to_rental_id}`}
                >
                  <Truck className="mr-1 size-3.5" />
                  Ver renta
                </Link>
              </Button>
            )}
          </section>
        )}
      </main>
    </>
  )
}

function DetailItem({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string | null
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-sm font-semibold">{value}</p>
      {sub && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>
      )}
    </div>
  )
}

function StatusBanner({
  status,
  reservation,
}: {
  status: string
  reservation: { code: string }
}) {
  const map: Record<
    string,
    { label: string; cls: string; Icon: typeof CheckCircle2 }
  > = {
    pendiente: {
      label: "Reserva pendiente · Confirma para apartar el equipo",
      cls: "bg-zinc-50 text-zinc-800 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800",
      Icon: Clock,
    },
    confirmada: {
      label: "Reserva confirmada · Convertir a préstamo o renta al inicio",
      cls: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
      Icon: CheckCircle2,
    },
    vencida: {
      label: "Vencida · La fecha de fin ya pasó sin conversión",
      cls: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
      Icon: AlertTriangle,
    },
    cancelada: {
      label: "Cancelada",
      cls: "bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-800",
      Icon: XCircle,
    },
    convertida_prestamo: {
      label: "Convertida a préstamo",
      cls: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
      Icon: PackageCheck,
    },
    convertida_renta: {
      label: "Convertida a renta",
      cls: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
      Icon: Truck,
    },
  }
  const m = map[status] ?? map.pendiente
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${m.cls}`}
    >
      <m.Icon className="size-4 shrink-0" />
      <span>
        <strong className="font-mono">{reservation.code}</strong> — {m.label}
      </span>
    </div>
  )
}
