import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { listCollaborators } from "@/server/services/collaborator.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import {
  CollaboratorManager,
  type CollaboratorUI,
} from "@/components/collaborators/collaborator-manager"

export const metadata: Metadata = { title: "Colaboradores" }

export default async function ColaboradoresPage() {
  const session = await requireStudioAuth()
  const [rows, unread] = await Promise.all([
    listCollaborators(session.studioId, { includeInactive: true }),
    countUnreadNotifications(session.studioId),
  ])

  const collaborators: CollaboratorUI[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    phone: c.phone,
    whatsapp: c.whatsapp,
    email: c.email,
    serviceOffered: c.service_offered,
    baseRate: c.base_rate != null ? Number(c.base_rate) : null,
    notes: c.notes,
    status: c.status,
  }))

  return (
    <>
      <AppTopbar
        eyebrow="Equipo"
        title="Colaboradores"
        description="Maquillistas, asistentes, 2º fotógrafo y demás colaboradores de tu estudio"
        unreadNotifications={unread}
      />
      <div className="p-6">
        <CollaboratorManager collaborators={collaborators} />
      </div>
    </>
  )
}
