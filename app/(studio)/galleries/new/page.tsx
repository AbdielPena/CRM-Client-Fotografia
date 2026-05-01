import Link from "next/link"
import { AppTopbar } from "@/components/layout/app-topbar"
import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Galerías — Próximamente" }

export default async function NewGalleryPage() {
  const session = await requireStudioAuth()
  const unread = await countUnreadNotifications(session.studioId)

  return (
    <>
      <AppTopbar
        eyebrow="Galerías"
        title="Galerías"
        description="Comparte selecciones de fotos con tus clientes"
        unreadNotifications={unread}
      />
      <div className="px-6 py-6 lg:px-8 lg:py-8">
        <div className="max-w-xl sf-card p-8 text-center">
          <div className="w-12 h-12 bg-muted/60 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-4l-2-2H6a2 2 0 00-2 2z"
              />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-foreground mb-2">
            Galerías — próximamente
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Estamos rehaciendo el módulo de galerías sobre Supabase Storage.
            Estará disponible en una fase posterior junto con las descargas
            de alta resolución y la selección de favoritas.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-5 py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:bg-foreground/90 transition-colors"
          >
            Volver al dashboard
          </Link>
        </div>
      </div>
    </>
  )
}
