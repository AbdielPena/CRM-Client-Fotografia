import { requireStudioAuth } from "@/server/middleware/auth"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getPackages } from "@/server/services/package.service"
import { getContractTemplates } from "@/server/services/contract.service"
import { NewClientForm } from "@/components/clients/new-client-form"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Nuevo cliente" }

export default async function NewClientPage() {
  const session = await requireStudioAuth()

  const [packages, templates, unread] = await Promise.all([
    getPackages(session.studioId),
    getContractTemplates(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  type PackageRow = {
    id: string
    name: string
    description: string | null
    price: number | string
    currency: string
    is_active: boolean
  }
  const packageOptions = (packages as PackageRow[]).map((p: PackageRow) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: Number(p.price),
    currency: p.currency,
    isActive: p.is_active,
  }))

  return (
    <>
      <AppTopbar
        eyebrow="Clientes"
        title="Nuevo cliente"
        description="Registra un cliente y genera su proyecto, contrato y facturas en un solo paso"
        unreadNotifications={unread}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <div className="max-w-2xl">
          <NewClientForm
            packages={packageOptions}
            hasContractTemplate={templates.length > 0}
          />
        </div>
      </div>
    </>
  )
}
