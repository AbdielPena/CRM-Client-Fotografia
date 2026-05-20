import {
  Users,
  Mail,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  listInvitations,
  listMembers,
} from "@/server/services/studio-members.service"
import { hasFeature, getFeatureLimit } from "@/server/services/billing.service"

import { AppTopbar } from "@/components/layout/app-topbar"

import { MembersManager } from "./members-manager"

export const metadata: Metadata = { title: "Miembros del studio" }

export default async function MembersPage() {
  const session = await requireStudioAuth()

  const [members, invitations, unread, maxUsers] = await Promise.all([
    listMembers(session.studioId),
    listInvitations(session.studioId, "pending"),
    countUnreadNotifications(session.studioId),
    getFeatureLimit(session.studioId, "max_users"),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Miembros del studio"
        description={`${members.length}${maxUsers ? ` / ${maxUsers}` : ""} miembros · ${invitations.length} invitaciones pendientes`}
        unreadNotifications={unread}
      />

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <MembersManager
          members={members}
          invitations={invitations}
          currentUserId={session.userId}
          maxUsers={maxUsers ?? null}
        />

        <section className="sf-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="mr-1 inline size-3.5" />
            Roles disponibles
          </h3>
          <dl className="space-y-2 text-xs">
            <div className="flex gap-2">
              <dt className="w-20 font-semibold">Owner</dt>
              <dd className="text-muted-foreground">
                Único, acceso total. No se puede cambiar.
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 font-semibold">Admin</dt>
              <dd className="text-muted-foreground">
                Acceso casi total. Puede invitar staff y editar settings.
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 font-semibold">Staff</dt>
              <dd className="text-muted-foreground">
                CRM, proyectos, galerías, tareas. Sin acceso a settings ni
                facturación.
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 font-semibold">Finance</dt>
              <dd className="text-muted-foreground">
                Solo facturación, finanzas, reportes. Sin acceso a CRM.
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 font-semibold">Viewer</dt>
              <dd className="text-muted-foreground">
                Solo lectura.
              </dd>
            </div>
          </dl>
        </section>
      </main>
    </>
  )
}
