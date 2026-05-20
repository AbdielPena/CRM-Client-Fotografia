import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvItems } from "@/server/services/inv-item.service"
import { untypedServer } from "@/server/supabase/untyped"

import { AppTopbar } from "@/components/layout/app-topbar"

import { NewRentalForm } from "./new-rental-form"

export const metadata: Metadata = { title: "Nuevo alquiler · Inventario" }

export default async function NewRentalPage() {
  const session = await requireStudioAuth()

  const sb = untypedServer()
  const [items, clientsRes, projectsRes, unread] = await Promise.all([
    getInvItems(session.studioId, { pageSize: 200, activeOnly: true }),
    sb
      .from("clients")
      .select("id, name")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("name")
      .limit(200),
    sb
      .from("projects")
      .select("id, name")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("name")
      .limit(100),
    countUnreadNotifications(session.studioId),
  ])

  const clients = (clientsRes.data ?? []) as Array<{ id: string; name: string }>
  const projects = (projectsRes.data ?? []) as Array<{ id: string; name: string }>

  return (
    <>
      <AppTopbar
        eyebrow="Inventario"
        title="Nuevo alquiler"
        description="Renta de equipo a cliente con tracking de cobro y devolución."
        unreadNotifications={unread}
        actions={
          <Link
            href="/inventory/rentals"
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <NewRentalForm
          items={items.items.map((it) => ({
            id: it.id,
            name: it.name,
            kind: it.kind,
            brand: it.brand,
            defaultRentalPricePerDay: Number(it.default_rental_price_per_day ?? 0),
          }))}
          clients={clients}
          projects={projects}
        />
      </div>
    </>
  )
}
