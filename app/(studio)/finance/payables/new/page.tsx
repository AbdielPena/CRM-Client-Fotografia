import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { AppTopbar } from "@/components/layout/app-topbar"
import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"

import { NewPayableForm } from "./new-payable-form"

export const metadata: Metadata = { title: "Nueva CxP · Finanzas" }

export default async function NewPayablePage() {
  const session = await requireStudioAuth()
  const unread = await countUnreadNotifications(session.studioId)

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Nueva cuenta por pagar"
        description="Registra una factura o compromiso de pago a un proveedor."
        unreadNotifications={unread}
        actions={
          <Link
            href="/finance/payables"
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <NewPayableForm />
      </div>
    </>
  )
}
