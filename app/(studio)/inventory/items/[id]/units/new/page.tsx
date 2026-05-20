import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Package as PackageIcon } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvItemById } from "@/server/services/inv-item.service"
import { untypedServer } from "@/server/supabase/untyped"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"

import { NewUnitForm } from "./new-unit-form"

export const metadata: Metadata = { title: "Nueva unidad · Inventario" }

export default async function NewItemUnitPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()

  const sb = untypedServer()
  const [item, locationsRes, unread] = await Promise.all([
    getInvItemById(session.studioId, params.id),
    sb
      .from("inv_locations")
      .select("id, name")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("name")
      .limit(200),
    countUnreadNotifications(session.studioId),
  ])

  if (!item) notFound()

  if (item.kind !== "serialized") {
    return (
      <>
        <AppTopbar
          eyebrow="Inventario / Items"
          title="No aplica"
          description="Este item es a granel — no admite unidades serializadas."
          unreadNotifications={unread}
        />
        <main className="mx-auto max-w-2xl px-4 py-12">
          <EmptyState
            icon={<PackageIcon className="size-12 text-muted-foreground/60" />}
            title="Item kind = bulk"
            description="Solo items serializados pueden tener unidades individuales. Cambia el kind o crea un item nuevo."
          >
            <Button asChild>
              <Link href={`/inventory/items/${item.id}`}>
                <ArrowLeft className="mr-1 size-4" />
                Volver al item
              </Link>
            </Button>
          </EmptyState>
        </main>
      </>
    )
  }

  const locations = (locationsRes.data ?? []) as Array<{
    id: string
    name: string
  }>

  return (
    <>
      <AppTopbar
        eyebrow={`Inventario / ${item.name}`}
        title="Nueva unidad serializada"
        description="Registra N/S, QR, código interno, ubicación y datos de compra. Aparecerá como disponible automáticamente."
        unreadNotifications={unread}
        actions={
          <Link
            href={`/inventory/items/${item.id}/units`}
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <NewUnitForm
          itemId={item.id}
          itemName={item.name}
          locations={locations}
        />
      </div>
    </>
  )
}
