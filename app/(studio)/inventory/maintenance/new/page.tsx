import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvItems } from "@/server/services/inv-item.service"

import { AppTopbar } from "@/components/layout/app-topbar"

import { NewMaintenanceForm } from "./new-maintenance-form"

export const metadata: Metadata = { title: "Nuevo mantenimiento · Inventario" }

export default async function NewMaintenancePage({
  searchParams,
}: {
  searchParams?: { itemId?: string; itemUnitId?: string }
}) {
  const session = await requireStudioAuth()

  const [items, unread] = await Promise.all([
    getInvItems(session.studioId, { pageSize: 300, activeOnly: true }),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Inventario · Mantenimiento"
        title="Registrar mantenimiento"
        description="Reparaciones, calibraciones, limpieza, cambios de pieza. Si inicias ahora, la unidad se marca como en mantenimiento."
        unreadNotifications={unread}
        actions={
          <Link
            href="/inventory/maintenance"
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <NewMaintenanceForm
          items={items.items.map((it) => ({
            id: it.id,
            name: it.name,
            kind: it.kind,
            brand: it.brand,
          }))}
          prefillItemId={searchParams?.itemId}
          prefillItemUnitId={searchParams?.itemUnitId}
        />
      </div>
    </>
  )
}
