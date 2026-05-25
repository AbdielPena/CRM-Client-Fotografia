import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { AppTopbar } from "@/components/layout/app-topbar"
import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"

import { NewItemForm } from "./new-item-form"

export const metadata: Metadata = { title: "Nuevo item · Inventario" }

export default async function NewInventoryItemPage() {
  const session = await requireStudioAuth()
  const unread = await countUnreadNotifications(session.studioId)

  return (
    <>
      <AppTopbar
        eyebrow="Inventario"
        title="Nuevo item"
        description="Registra un equipo en el catálogo. Los serializados llevan unidades individuales con N/S; los a granel llevan contador."
        unreadNotifications={unread}
        actions={
          <Link
            href="/inventory/items"
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <NewItemForm />
      </div>
    </>
  )
}
