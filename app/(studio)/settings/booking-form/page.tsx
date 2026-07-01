import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getBookingFormConfig } from "@/server/services/booking-form.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { BookingFormEditor } from "@/components/settings/booking-form-editor"

export const metadata: Metadata = { title: "Formulario de reserva" }
export const dynamic = "force-dynamic"

export default async function BookingFormSettingsPage() {
  const session = await requireStudioAuth()

  const supabase = createSupabaseServiceClient()
  const [config, unread, { data: studio }, { data: pkg }] = await Promise.all([
    getBookingFormConfig(session.studioId),
    countUnreadNotifications(session.studioId),
    supabase.from("studios").select("slug").eq("id", session.studioId).maybeSingle(),
    supabase
      .from("packages")
      .select("slug")
      .eq("studio_id", session.studioId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const studioSlug = (studio as { slug?: string } | null)?.slug ?? null
  const pkgSlug = (pkg as { slug?: string } | null)?.slug ?? null
  const previewUrl =
    studioSlug && pkgSlug
      ? `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""}/p/${studioSlug}/${pkgSlug}/book`
      : null

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Formulario de reserva"
        description="Personaliza el formulario que tus clientes llenan para solicitar una reserva (aplica a todos los paquetes)."
        unreadNotifications={unread}
      />
      <div className="p-6 lg:p-8">
        <BookingFormEditor initialConfig={config} previewUrl={previewUrl} />
      </div>
    </>
  )
}
