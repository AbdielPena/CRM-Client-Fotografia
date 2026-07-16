import type { Metadata } from "next"
import { Images } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getPortfolioCategories,
  getPortfolioItems,
} from "@/server/services/portfolio.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { PortfolioManager } from "@/components/portfolio/portfolio-manager"

export const metadata: Metadata = { title: "Portafolio" }
export const dynamic = "force-dynamic"

export default async function PortfolioPage() {
  const session = await requireStudioAuth()
  const [categories, items, unread] = await Promise.all([
    getPortfolioCategories(session.studioId),
    getPortfolioItems(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  const published = items.filter((i) => i.published).length

  return (
    <>
      <AppTopbar
        eyebrow="Estudio"
        title="Portafolio"
        description="Las fotos que enseñas al mundo en abbypixel.com. Marca fotos desde una galería o súbelas aquí."
        unreadNotifications={unread}
      />

      <div className="space-y-6 px-6 py-6 lg:px-8 lg:py-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div className="sf-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Images className="h-4 w-4" />
              <span className="text-[11px] uppercase tracking-wide">En el portafolio</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{items.length}</p>
          </div>
          <div className="sf-card p-4">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Publicadas en la web
            </span>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{published}</p>
          </div>
          <div className="sf-card p-4">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              En borrador
            </span>
            <p className="mt-1 text-2xl font-bold text-amber-600">{items.length - published}</p>
          </div>
        </div>

        <PortfolioManager categories={categories} items={items} />

        <p className="text-[11px] text-muted-foreground">
          Solo las fotos <strong>publicadas</strong> salen en abbypixel.com. Despublicar
          la quita de la web pero la deja aquí. El <strong>orden</strong> manda en la
          web: la primera de cada bloque sale de protagonista.
        </p>
      </div>
    </>
  )
}
