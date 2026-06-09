import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { FlowBuilder } from "@/components/engagement/flow-builder"

export const metadata: Metadata = { title: "Nueva automatización" }

export default async function NewEngagementAutomationPage() {
  const session = await requireStudioAuth()
  const unread = await countUnreadNotifications(session.studioId)

  return (
    <>
      <AppTopbar
        title="Nueva automatización"
        description="Construye una secuencia de pasos: espera, email, tarea, etiqueta, reseña…"
        unreadNotifications={unread}
      />
      <div className="px-6 py-6 lg:px-8 lg:py-8">
        <FlowBuilder />
      </div>
    </>
  )
}
