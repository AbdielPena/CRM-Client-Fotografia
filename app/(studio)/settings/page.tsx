import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { SettingsForm } from "@/components/settings/settings-form"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Configuración" }

export default async function SettingsPage() {
  const session = await requireStudioAuth()
  const supabase = createSupabaseServerClient()

  const [studioResult, unread] = await Promise.all([
    supabase
      .from("studios")
      .select(
        "id, name, email, phone, website, address, city, country, logo_url, currency, timezone, invoice_prefix, invoice_footer, contract_footer, tax_id, payment_instructions, payment_whatsapp, plan",
      )
      .eq("id", session.studioId)
      .maybeSingle(),
    countUnreadNotifications(session.studioId),
  ])
  const studio = studioResult.data

  if (!studio) return null

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Configuración"
        description="Administra el perfil y preferencias de tu estudio"
        unreadNotifications={unread}
      />
      <div className="px-6 py-6 lg:px-8 lg:py-8 max-w-3xl">
        {/* plan may be null from DB; SettingsForm handles it */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <SettingsForm studio={studio as any} />
      </div>
    </>
  )
}
