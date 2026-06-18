import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getDressStores,
  getDressCatalog,
  getSelectionsWithPrices,
} from "@/server/services/dress-catalog.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { DressManager } from "@/components/dresses/dress-manager"

export const metadata: Metadata = { title: "Vestidos" }
export const dynamic = "force-dynamic"

export default async function VestidosPage() {
  const session = await requireStudioAuth()
  const [stores, dresses, selections, unread] = await Promise.all([
    getDressStores(session.studioId),
    getDressCatalog(session.studioId),
    getSelectionsWithPrices(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        title="Vestidos"
        description={`${dresses.length} vestidos · ${stores.length} tienda${stores.length === 1 ? "" : "s"}`}
        unreadNotifications={unread}
      />
      <div className="px-6 py-6 lg:px-8 lg:py-8">
        <DressManager stores={stores} dresses={dresses} selections={selections} />
      </div>
    </>
  )
}
