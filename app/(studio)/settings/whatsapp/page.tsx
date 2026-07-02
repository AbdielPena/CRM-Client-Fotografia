import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getWhatsAppStatus } from "@/server/services/whatsapp/cloud-api.service"
import {
  getSelectionWaTemplate,
  getDeliveryWaTemplate,
} from "@/server/services/share-message.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { WhatsAppSettings } from "@/components/settings/whatsapp-settings"
import { SelectionMessageEditor } from "@/components/settings/selection-message-editor"
import { DeliveryMessageEditor } from "@/components/settings/delivery-message-editor"

export const metadata: Metadata = { title: "WhatsApp" }

export default async function WhatsAppSettingsPage() {
  const session = await requireStudioAuth()

  const [status, unread, selectionMsg, deliveryMsg] = await Promise.all([
    getWhatsAppStatus(session.studioId),
    countUnreadNotifications(session.studioId),
    getSelectionWaTemplate(session.studioId),
    getDeliveryWaTemplate(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="WhatsApp (Meta Cloud API)"
        description="Conecta WhatsApp para enviar mensajes automáticos de fidelización a tus clientes"
        unreadNotifications={unread}
      />
      <div className="p-6">
        <WhatsAppSettings status={status} />
        <SelectionMessageEditor initial={selectionMsg} />
        <DeliveryMessageEditor initial={deliveryMsg} />
      </div>
    </>
  )
}
