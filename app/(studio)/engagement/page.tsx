import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { listEngagementAutomations } from "@/server/services/engagement.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { EngagementManager } from "@/components/engagement/engagement-manager"

export const metadata: Metadata = { title: "Client Engagement Hub" }
export const dynamic = "force-dynamic"

export default async function EngagementPage() {
  const session = await requireStudioAuth()
  const [automations, unread] = await Promise.all([
    listEngagementAutomations(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        title="Client Engagement Hub"
        description="Fideliza a tus clientes con automatizaciones por fecha: cumpleaños, post-entrega, reseñas e inactividad."
        unreadNotifications={unread}
      />
      <div className="px-6 py-6 lg:px-8 lg:py-8">
        <EngagementManager automations={automations} />
      </div>
    </>
  )
}
