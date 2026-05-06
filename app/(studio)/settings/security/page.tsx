import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { listMfaFactorsAction } from "@/server/actions/mfa.actions"
import { countUnreadNotifications } from "@/server/services/notification.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { MfaManager } from "@/components/settings/mfa-manager"

export const metadata: Metadata = { title: "Seguridad" }

export default async function SecurityPage() {
  const session = await requireStudioAuth()

  const [factors, unread] = await Promise.all([
    listMfaFactorsAction().catch(() => []),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Seguridad"
        description="Protegé tu cuenta con autenticación de dos factores y revisá tus dispositivos conectados."
        unreadNotifications={unread}
      />

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-6 lg:px-8 lg:py-8">
        <section>
          <MfaManager initialFactors={factors} />
        </section>
      </div>
    </>
  )
}
