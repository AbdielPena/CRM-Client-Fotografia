import { requireStudioAuth } from "@/server/middleware/auth"
import { getPackages } from "@/server/services/package.service"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { PackageManager } from "@/components/settings/package-manager"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Paquetes" }

export default async function PackagesSettingsPage() {
  const session = await requireStudioAuth()

  // Para construir el link público necesitamos el slug del studio
  const supabase = createSupabaseServerClient()
  const { data: studio } = await supabase
    .from("studios")
    .select("slug")
    .eq("id", session.studioId)
    .maybeSingle()

  const [packages, unread] = await Promise.all([
    getPackages(session.studioId),
    countUnreadNotifications(session.studioId),
  ])
  const studioSlug = (studio as { slug?: string } | null)?.slug ?? ""

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Paquetes"
        description="Define los paquetes de servicios que ofreces a tus clientes"
        unreadNotifications={unread}
      />
      <div className="p-6">
        <PackageManager
          studioSlug={studioSlug}
          packages={(packages as Array<{
            id: string
            name: string
            slug: string
            description: string | null
            price: number | string
            currency: string
            duration_hours: number | null
            edited_photos: number | null
            includes: string[] | null
            is_active: boolean
          }>).map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            description: p.description ?? undefined,
            price: Number(p.price),
            currency: p.currency,
            durationHours: p.duration_hours ?? undefined,
            editedPhotos: p.edited_photos ?? undefined,
            includes: p.includes ? p.includes.join("\n") : undefined,
            isActive: p.is_active,
          }))}
        />
      </div>
    </>
  )
}
