import Link from "next/link"
import { ArrowLeft, Send } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getMailAccounts } from "@/server/services/mail-account.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"

import { ComposeForm } from "./compose-form"

export const metadata: Metadata = { title: "Redactar · Correo" }

export default async function ComposePage({
  searchParams,
}: {
  searchParams?: { to?: string; subject?: string; client?: string; project?: string; invoice?: string }
}) {
  const session = await requireStudioAuth()
  const [accounts, unread] = await Promise.all([
    getMailAccounts(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  if (accounts.length === 0) {
    return (
      <>
        <AppTopbar
          eyebrow="Correo"
          title="Redactar"
          unreadNotifications={unread}
        />
        <main className="mx-auto max-w-3xl px-4 py-12">
          <EmptyState
            icon={<Mail className="size-12 text-muted-foreground/60" />}
            title="Configura una cuenta primero"
            description="Para enviar emails necesitas conectar al menos una cuenta Mailcow."
          >
            <Button asChild>
              <Link href="/settings/mail">Configurar Mailcow</Link>
            </Button>
          </EmptyState>
        </main>
      </>
    )
  }

  const defaultAccount = accounts.find((a) => a.is_default) ?? accounts[0]

  return (
    <>
      <AppTopbar
        eyebrow="Correo"
        title="Redactar"
        description="Compose un nuevo email. La cuenta default emite outbound por defecto."
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/mail/inbox">
              <ArrowLeft className="mr-1 size-3.5" />
              Cancelar
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ComposeForm
          accounts={accounts.map((a) => ({
            id: a.id,
            email: a.email,
            display_name: a.display_name,
            is_default: a.is_default,
          }))}
          defaultAccountId={defaultAccount.id}
          prefillTo={searchParams?.to}
          prefillSubject={searchParams?.subject}
          prefillClientId={searchParams?.client}
          prefillProjectId={searchParams?.project}
          prefillInvoiceId={searchParams?.invoice}
        />
      </main>
    </>
  )
}
