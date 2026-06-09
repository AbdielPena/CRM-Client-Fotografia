import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { TEMPLATE_CATALOG } from "@/server/services/email-template.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { FlowBuilder } from "@/components/engagement/flow-builder"

export const metadata: Metadata = { title: "Nueva automatización" }

// Plantillas de email de cara al cliente — disponibles para "versión WhatsApp".
const CLIENT_FACING_CATEGORIES = ["client", "booking", "invoice", "gallery", "delivery", "engagement"]

export default async function NewEngagementAutomationPage() {
  const session = await requireStudioAuth()
  const unread = await countUnreadNotifications(session.studioId)

  const emailTemplates = Object.entries(TEMPLATE_CATALOG)
    .filter(([, t]) => CLIENT_FACING_CATEGORIES.includes(t.category))
    .map(([slug, t]) => ({ slug, label: t.label }))

  return (
    <>
      <AppTopbar
        title="Nueva automatización"
        description="Construye una secuencia de pasos: espera, email, tarea, etiqueta, reseña…"
        unreadNotifications={unread}
      />
      <div className="px-6 py-6 lg:px-8 lg:py-8">
        <FlowBuilder emailTemplates={emailTemplates} />
      </div>
    </>
  )
}
