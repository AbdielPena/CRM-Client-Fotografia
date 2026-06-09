import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getServiceCategories } from "@/server/services/service-category.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { ServiceCategoryManager } from "@/components/settings/service-category-manager"

export const metadata: Metadata = { title: "Categorías de Servicios" }

export default async function ServiceCategoriesSettingsPage() {
  const session = await requireStudioAuth()

  const [categories, unread] = await Promise.all([
    getServiceCategories(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Categorías de Servicios"
        description="Organiza tus planes, proyectos y carpetas de Google Drive por tipo de servicio"
        unreadNotifications={unread}
      />
      <div className="p-6">
        <ServiceCategoryManager
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            color: c.color,
            icon: c.icon,
            description: c.description,
            isActive: c.isActive,
            sortOrder: c.sortOrder,
          }))}
        />
      </div>
    </>
  )
}
