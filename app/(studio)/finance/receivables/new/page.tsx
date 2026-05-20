import Link from "next/link"
import { ArrowLeft, Save, AlertCircle } from "lucide-react"
import type { Metadata } from "next"

import { AppTopbar } from "@/components/layout/app-topbar"
import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"

import { NewReceivableForm } from "./new-receivable-form"

export const metadata: Metadata = { title: "Nueva CxC · Finanzas" }

export default async function NewReceivablePage() {
  const session = await requireStudioAuth()
  const unread = await countUnreadNotifications(session.studioId)

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Nueva cuenta por cobrar"
        description="Registra un cobro pendiente de un cliente. Si tienes invoice del CRM, vincúlala para tracking automático."
        unreadNotifications={unread}
        actions={
          <Link
            href="/finance/receivables"
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <NewReceivableForm />
      </div>
    </>
  )
}
