import { cookies } from "next/headers"
import { CalendarCheck } from "lucide-react"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { StatusBadge } from "@/components/shared/status-badge"
import { formatDate, formatDateShort } from "@/lib/utils/currency"

export const dynamic = "force-dynamic"

export default async function PortalBookingsPage() {
  const session = parsePortalCookieValue(cookies().get(PORTAL_COOKIE_NAME)?.value)
  if (!session) return null

  const supabase = createSupabaseServiceClient()
  const { data: bookingsRaw } = await supabase
    .from("booking_requests")
    .select("id, status, event_date, event_location, package_id, created_at")
    .eq("client_id", session.clientId)
    .order("created_at", { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingsRaw ?? []) as any[]

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Tus reservas
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Sesiones reservadas con tu fotógrafo.
        </p>
      </header>

      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <CalendarCheck className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Aún no hay reservas.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center gap-4 px-5 py-4">
                <CalendarCheck className="h-5 w-5 flex-shrink-0 text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {b.event_date
                      ? `Sesión ${formatDate(new Date(b.event_date))}`
                      : "Reserva"}
                  </p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                    {b.event_location ?? "Ubicación a confirmar"} · creada{" "}
                    {formatDateShort(new Date(b.created_at))}
                  </p>
                </div>
                <StatusBadge status={String(b.status)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
