import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"

import { AppTopbar } from "@/components/layout/app-topbar"

import { NewAutomationForm } from "./new-automation-form"

export const metadata: Metadata = { title: "Nueva automatización" }

export default async function NewAutomationPage() {
  const session = await requireStudioAuth()
  const unread = await countUnreadNotifications(session.studioId)

  return (
    <>
      <AppTopbar
        eyebrow="Workflows"
        title="Nueva automatización"
        description="Define un evento que dispare una acción cuando ocurra en tu studio."
        unreadNotifications={unread}
        actions={
          <Link
            href="/automations"
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <NewAutomationForm />
      </div>
    </>
  )
}
