import { requireStudioAuth } from "@/server/middleware/auth"
import { getPackages } from "@/server/services/package.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { PackageManager } from "@/components/settings/package-manager"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Paquetes" }

export default async function PackagesSettingsPage() {
  const session = await requireStudioAuth()

  // Las 3 queries en paralelo. studioSlug ya viene en `session` (poblado
  // por requireStudioAuth desde la tabla studios) — eliminamos query
  // duplicada.
  const [packages, unread] = await Promise.all([
    getPackages(session.studioId),
    countUnreadNotifications(session.studioId),
  ])
  const studioSlug = session.studioSlug

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
