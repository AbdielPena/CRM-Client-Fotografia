import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getAutomations } from "@/server/services/email-automation.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { untypedServer } from "@/server/supabase/untyped"
import { AppTopbar } from "@/components/layout/app-topbar"
import {
  EmailAutomationsSettings,
  type AutomationsInitial,
} from "@/components/settings/email-automations-settings"
export const metadata: Metadata = { title: "Automatizaciones de correo" }
export const dynamic = "force-dynamic"

export default async function EmailAutomationsPage() {
  const session = await requireStudioAuth()
  const sb = untypedServer()

  const [flujos, unread, { data: pausRows }] = await Promise.all([
    getAutomations(session.studioId),
    countUnreadNotifications(session.studioId),
    sb
      .from("clients")
      .select("id, name")
      .eq("studio_id", session.studioId)
      .not("automations_paused_at", "is", null)
      .order("name"),
  ])

  const initial = Object.fromEntries(
    flujos.map((f) => [
      f.key,
      {
        enabled: f.enabled,
        every_days: f.every_days,
        offset_days: f.offset_days,
        max_days: f.max_days,
      },
    ]),
  ) as AutomationsInitial

  const pausedClients = ((pausRows ?? []) as Array<{ id: string; name: string | null }>).map(
    (c) => ({ id: c.id, name: c.name?.trim() || "Sin nombre" }),
  )

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Automatizaciones de correo"
        description="Cada cuánto insiste el sistema y cuándo se rinde. Los cambios aplican desde el próximo barrido, sin tocar lo que ya salió."
        unreadNotifications={unread}
      />
      <div className="p-6">
        <div className="max-w-3xl">
          <EmailAutomationsSettings
            initial={initial}
            pausedClients={pausedClients}
          />
        </div>
      </div>
    </>
  )
}
