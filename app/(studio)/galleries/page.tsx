import Link from "next/link"
import { Image as ImageIcon, Sparkles } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"

export const metadata: Metadata = { title: "Galerías" }

export default async function GalleriesPage() {
  const session = await requireStudioAuth()
  const unread = await countUnreadNotifications(session.studioId)

  return (
    <>
      <AppTopbar
        eyebrow="Entrega y selección"
        title="Galerías"
        description="Comparte selecciones de fotos con tus clientes — con cover, favoritos y descargas."
        unreadNotifications={unread}
      />

      <div className="px-6 py-6 lg:px-8 lg:py-8">
        <div className="rounded-xl border border-border bg-card shadow-xs">
          <EmptyState
            icon={<ImageIcon className="h-5 w-5" />}
            title="Galerías — próximamente"
            description="Estamos rehaciendo el módulo sobre Supabase Storage con galerías privadas, cover dinámico, selección de favoritas y descargas."
            accent
          >
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Volver al dashboard
              </Link>
            </Button>
          </EmptyState>
        </div>
      </div>
    </>
  )
}
