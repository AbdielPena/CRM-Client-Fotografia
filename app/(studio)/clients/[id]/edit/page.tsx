import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getClientById } from "@/server/services/client.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { EditClientForm } from "@/components/clients/edit-client-form"

export const metadata: Metadata = { title: "Editar cliente" }

export default async function EditClientPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()

  const [client, unread] = await Promise.all([
    getClientById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])

  if (!client) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any

  return (
    <>
      <AppTopbar
        eyebrow="Clientes"
        title={`Editar — ${c.name ?? "Cliente"}`}
        description="Actualiza los datos de contacto del cliente"
        unreadNotifications={unread}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <div className="max-w-2xl">
          <EditClientForm
            client={{
              id: c.id,
              name: c.name ?? "",
              email: c.email ?? null,
              phone: c.phone ?? null,
              source: c.source ?? null,
              notes: c.notes ?? null,
              address: c.address ?? null,
              city: c.city ?? null,
              country: c.country ?? null,
              instagramHandle: c.instagram_handle ?? null,
              websiteUrl: c.website_url ?? null,
            }}
          />
        </div>
      </div>
    </>
  )
}
