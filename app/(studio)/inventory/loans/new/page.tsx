import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvItems } from "@/server/services/inv-item.service"
import { untypedServer } from "@/server/supabase/untyped"

import { AppTopbar } from "@/components/layout/app-topbar"

import { NewLoanForm } from "./new-loan-form"

export const metadata: Metadata = { title: "Nuevo préstamo · Inventario" }

export default async function NewLoanPage() {
  const session = await requireStudioAuth()
  const sb = untypedServer()

  const [items, responsiblesRes, projectsRes, bookingsRes, unread] =
    await Promise.all([
      getInvItems(session.studioId, { pageSize: 200, activeOnly: true }),
      sb
        .from("inv_internal_responsibles")
        .select("id, full_name, department, position")
        .eq("studio_id", session.studioId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("full_name")
        .limit(100),
      sb
        .from("projects")
        .select("id, name")
        .eq("studio_id", session.studioId)
        .is("deleted_at", null)
        .order("name")
        .limit(100),
      sb
        .from("bookings")
        .select("id, event_date, event_type")
        .eq("studio_id", session.studioId)
        .gte("event_date", new Date().toISOString().slice(0, 10))
        .order("event_date")
        .limit(50),
      countUnreadNotifications(session.studioId),
    ])

  const responsibles = (responsiblesRes.data ?? []) as Array<{
    id: string
    full_name: string
    department: string | null
    position: string | null
  }>
  const projects = (projectsRes.data ?? []) as Array<{
    id: string
    name: string
  }>
  const bookings = (bookingsRes.data ?? []) as Array<{
    id: string
    event_date: string
    event_type: string
  }>

  return (
    <>
      <AppTopbar
        eyebrow="Inventario"
        title="Nuevo préstamo interno"
        description="Asigna equipo a un responsible del studio. Sin cobro (para alquileres comerciales usa Rentas)."
        unreadNotifications={unread}
        actions={
          <Link
            href="/inventory/loans"
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <NewLoanForm
          items={items.items.map((it) => ({
            id: it.id,
            name: it.name,
            kind: it.kind,
            brand: it.brand,
          }))}
          responsibles={responsibles}
          projects={projects}
          bookings={bookings}
        />
      </div>
    </>
  )
}
