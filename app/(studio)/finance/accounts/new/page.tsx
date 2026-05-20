import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { AppTopbar } from "@/components/layout/app-topbar"
import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinBanks } from "@/server/services/fin-account.service"

import { NewAccountForm } from "./new-account-form"

export const metadata: Metadata = { title: "Nueva cuenta · Finanzas" }

export default async function NewFinAccountPage() {
  const session = await requireStudioAuth()
  const [banks, unread] = await Promise.all([
    getFinBanks(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Nueva cuenta"
        description="Registra una cuenta bancaria o de efectivo. Su balance se calculará automáticamente con las transacciones."
        unreadNotifications={unread}
        actions={
          <Link
            href="/finance/accounts"
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <NewAccountForm banks={banks} />
      </div>
    </>
  )
}
