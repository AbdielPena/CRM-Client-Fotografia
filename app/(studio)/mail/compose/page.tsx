import Link from "next/link"
import { ArrowLeft, Send } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getMailAccounts } from "@/server/services/mail-account.service"
import { getMailDraftById } from "@/server/services/mail-draft.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"

import { ComposeForm } from "./compose-form"

export const metadata: Metadata = { title: "Redactar · Correo" }

export default async function ComposePage({
  searchParams,
}: {
  searchParams?: {
    to?: string
    subject?: string
    client?: string
    project?: string
    invoice?: string
    draftId?: string
  }
}) {
  const session = await requireStudioAuth()
  const [accounts, draft, unread] = await Promise.all([
    getMailAccounts(session.studioId),
    searchParams?.draftId
      ? getMailDraftById(session.studioId, searchParams.draftId)
      : Promise.resolve(null),
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

  // Si retomamos un draft, usar sus valores
  type DraftLoaded = {
    id: string
    account_id: string
    subject: string | null
    body_text: string | null
    to_recipients: Array<{ email: string; name: string | null }>
    client_id: string | null
    project_id: string | null
    invoice_id: string | null
  } | null
  const d = draft as DraftLoaded
  const draftPrefillTo = d?.to_recipients
    ?.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email))
    .join(", ")

  return (
    <>
      <AppTopbar
        eyebrow="Correo"
        title={d ? "Retomar borrador" : "Redactar"}
        description={
          d
            ? "Auto-save activo. Tu borrador se guarda cada 5s."
            : "Compose un nuevo email. La cuenta default emite outbound por defecto."
        }
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={d ? "/mail/drafts" : "/mail/inbox"}>
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
          defaultAccountId={d?.account_id ?? defaultAccount.id}
          prefillTo={draftPrefillTo ?? searchParams?.to}
          prefillSubject={d?.subject ?? searchParams?.subject}
          prefillClientId={d?.client_id ?? searchParams?.client}
          prefillProjectId={d?.project_id ?? searchParams?.project}
          prefillInvoiceId={d?.invoice_id ?? searchParams?.invoice}
          initialDraftId={d?.id ?? searchParams?.draftId}
          initialBody={d?.body_text ?? undefined}
        />
      </main>
    </>
  )
}
