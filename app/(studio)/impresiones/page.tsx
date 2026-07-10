import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { listStudioPrintOverview } from "@/server/services/print-selection.service"
import { getPrintWaTemplate } from "@/server/services/share-message.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { PrintOverviewList } from "@/components/prints/print-overview-list"

export const metadata: Metadata = { title: "Impresiones" }
export const dynamic = "force-dynamic"

export default async function PrintsOverviewPage() {
  const session = await requireStudioAuth()
  const [items, waPrintTemplate, unread] = await Promise.all([
    listStudioPrintOverview(session.studioId),
    getPrintWaTemplate(session.studioId).catch(() => ""),
    countUnreadNotifications(session.studioId),
  ])

  const pendientes = items.filter(
    (i) => i.status === "pending" || i.status === "in_progress",
  ).length

  return (
    <>
      <AppTopbar
        title="Impresiones"
        description={
          items.length === 0
            ? "Selección de impresiones por cliente"
            : `${pendientes} pendiente${pendientes === 1 ? "" : "s"} de selección · ${items.length} en total`
        }
        unreadNotifications={unread}
      />

      <div className="px-6 py-6 lg:px-8 lg:py-8">
        <PrintOverviewList items={items} waPrintTemplate={waPrintTemplate} />
      </div>
    </>
  )
}
