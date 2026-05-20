import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getStudioBranding } from "@/server/services/studio-branding.service"
import {
  hasFeature,
} from "@/server/services/billing.service"

import { AppTopbar } from "@/components/layout/app-topbar"

import { BrandingForm } from "./branding-form"

export const metadata: Metadata = { title: "Marca y personalización" }

export default async function BrandingSettingsPage() {
  const session = await requireStudioAuth()

  const [branding, unread, canCustomDomain, canRemoveBranding] =
    await Promise.all([
      getStudioBranding(session.studioId),
      countUnreadNotifications(session.studioId),
      hasFeature(session.studioId, "custom_domain"),
      hasFeature(session.studioId, "remove_branding"),
    ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Marca y personalización"
        description="Logo, colores, locale, dominio propio, copy de las páginas públicas — control total."
        unreadNotifications={unread}
      />

      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <BrandingForm
          branding={branding}
          canCustomDomain={canCustomDomain}
          canRemoveBranding={canRemoveBranding}
        />
      </main>
    </>
  )
}
