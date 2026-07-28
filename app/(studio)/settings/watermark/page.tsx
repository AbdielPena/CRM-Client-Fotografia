import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getStudioWatermarkDefaults } from "@/server/services/gallery-watermark.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import {
  WatermarkSettings,
  type WatermarkConfig,
} from "@/components/settings/watermark-settings"

export const metadata: Metadata = { title: "Marca de agua" }
export const dynamic = "force-dynamic"

export default async function WatermarkSettingsPage() {
  const session = await requireStudioAuth()
  const [cfg, unread] = await Promise.all([
    getStudioWatermarkDefaults(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  const initial: WatermarkConfig = {
    enabled: cfg.enabled,
    mode: cfg.mode === "image" ? "image" : "text",
    text: cfg.text,
    imageKey: cfg.imageKey,
    position: cfg.position,
    opacity: cfg.opacity,
    scale: cfg.scale,
    rotation: cfg.rotation,
    margin: cfg.margin,
  }

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Marca de agua"
        description="Protege las fotos de selección. Es la configuración que usan por defecto todas las galerías de selección; las de entrega final nunca llevan marca."
        unreadNotifications={unread}
      />
      <div className="p-6">
        <WatermarkSettings initial={initial} />
      </div>
    </>
  )
}
