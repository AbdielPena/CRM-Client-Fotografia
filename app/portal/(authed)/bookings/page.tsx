import { cookies } from "next/headers"
import { CalendarCheck, MapPin } from "lucide-react"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { StatusBadge } from "@/components/shared/status-badge"
import { formatDateShort } from "@/lib/utils/currency"
import { PortalHeader, PortalEmpty } from "@/components/portal/portal-ui"

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

  const dayFmt = new Intl.DateTimeFormat("es", { day: "2-digit" })
  const monFmt = new Intl.DateTimeFormat("es", { month: "short" })

  return (
    <div className="space-y-8">
      <PortalHeader
        eyebrow="Tu agenda"
        title="Tus reservas"
        description="Las sesiones que has reservado con tu fotógrafo."
      />

      {bookings.length === 0 ? (
        <PortalEmpty
          icon={CalendarCheck}
          title="Aún no hay reservas"
          description="Tus sesiones aparecerán aquí cuando reserves tu experiencia."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {bookings.map((b, i) => {
            const d = b.event_date ? new Date(String(b.event_date).slice(0, 10) + "T00:00:00") : null
            return (
              <div
                key={b.id}
                className="lx-card animate-fade-in-up flex items-center gap-4 p-5"
                style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
              >
                <div className="flex h-16 w-16 flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-soft text-gold-700">
                  {d ? (
                    <>
                      <span className="font-serif text-2xl font-semibold leading-none">
                        {dayFmt.format(d)}
                      </span>
                      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider">
                        {monFmt.format(d).replace(".", "")}
                      </span>
                    </>
                  ) : (
                    <CalendarCheck className="h-6 w-6" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-lg font-semibold text-foreground">
                    {d ? "Sesión fotográfica" : "Reserva"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 text-gold-600" />
                    {b.event_location ?? "Ubicación a confirmar"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                    Solicitada el {formatDateShort(new Date(b.created_at))}
                  </p>
                </div>
                <StatusBadge status={String(b.status)} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
