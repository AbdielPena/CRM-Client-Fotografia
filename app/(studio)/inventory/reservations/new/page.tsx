import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvItems } from "@/server/services/inv-item.service"
import { untypedServer } from "@/server/supabase/untyped"

import { AppTopbar } from "@/components/layout/app-topbar"

import { NewReservationForm } from "./new-reservation-form"

export const metadata: Metadata = { title: "Nueva reserva · Inventario" }

export default async function NewReservationPage() {
  const session = await requireStudioAuth()
  const sb = untypedServer()

  const [items, clientsRes, responsiblesRes, unread] = await Promise.all([
    getInvItems(session.studioId, { pageSize: 200, activeOnly: true }),
    sb
      .from("clients")
      .select("id, name")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("name")
      .limit(200),
    sb
      .from("inv_internal_responsibles")
      .select("id, full_name, department, position")
      .eq("studio_id", session.studioId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("full_name")
      .limit(100),
    countUnreadNotifications(session.studioId),
  ])

  const clients = (clientsRes.data ?? []) as Array<{
    id: string
    name: string
  }>
  const responsibles = (responsiblesRes.data ?? []) as Array<{
    id: string
    full_name: string
    department: string | null
    position: string | null
  }>

  return (
    <>
      <AppTopbar
        eyebrow="Inventario"
        title="Nueva reserva"
        description="Aparta equipo para una fecha futura. Sin movimiento de stock hasta conversión a préstamo o renta."
        unreadNotifications={unread}
        actions={
          <Link
            href="/inventory/reservations"
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <NewReservationForm
          items={items.items.map((it) => ({
            id: it.id,
            name: it.name,
            kind: it.kind,
            brand: it.brand,
          }))}
          clients={clients}
          responsibles={responsibles}
        />
      </div>
    </>
  )
}
