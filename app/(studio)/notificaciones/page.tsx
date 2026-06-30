import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getOutgoingNotificationsOrganized } from "@/server/services/outgoing-notifications.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { OutgoingMailbox } from "@/components/notificaciones/outgoing-mailbox"

export const metadata: Metadata = { title: "Correos enviados" }
export const dynamic = "force-dynamic"

export default async function NotificacionesPage() {
  const session = await requireStudioAuth()

  const [organized, unread] = await Promise.all([
    getOutgoingNotificationsOrganized(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Comunicación"
        title="Correos enviados"
        description="Por cliente y sesión de fotos; lo operativo del sistema, aparte. Cada apartado se despliega o se oculta."
        unreadNotifications={unread}
      />

      <div className="px-6 py-6 lg:px-8 lg:py-8">
        <OutgoingMailbox
          clients={organized.clients}
          system={organized.system}
          clientCount={organized.clientCount}
          systemCount={organized.systemCount}
        />
      </div>
    </>
  )
}
