import type { Metadata } from "next"
import { requireStudioAuth } from "@/server/middleware/auth"
import { getProjectStatuses } from "@/server/services/project-status.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { ProjectStatusManager } from "@/components/settings/project-status-manager"

export const metadata: Metadata = { title: "Estados de proyecto" }

export default async function ProjectStatusesPage() {
  const session = await requireStudioAuth()
  const [statuses, unread] = await Promise.all([
    getProjectStatuses(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Ajustes"
        title="Estados de proyecto"
        description="Crea y organiza las fases de tu flujo de trabajo. Arrastra para reordenar."
        unreadNotifications={unread}
      />

      <div className="px-6 py-8 lg:px-8">
        <ProjectStatusManager initialStatuses={statuses} />
      </div>
    </>
  )
}
