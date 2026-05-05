import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import {
  buildContractPlaceholders,
  injectSignatures,
  renderPlaceholders,
} from "@/server/services/contract-placeholders.service"
import { ContractSigningView } from "@/components/public/contract-signing-view"

export const metadata: Metadata = { title: "Firma de contrato" }
export const dynamic = "force-dynamic"

type ContractRow = {
  id: string
  title: string
  body_html: string | null
  status: string
  signing_token: string
  signed_at: string | null
  expires_at: string | null
  studio_id: string
  signature_image_url: string | null
  signed_name: string | null
  studio_signed_at: string | null
  studio_signed_name: string | null
  studio_signature_image_url: string | null
  project: unknown
}

function pickFirst(v: unknown) {
  if (!v) return null
  if (Array.isArray(v)) return v[0] ?? null
  return v
}

export default async function ContractSigningPage({
  params,
}: {
  params: { token: string }
}) {
  const supabase = createSupabaseServiceClient()

  const { data: contractRaw } = await supabase
    .from("contracts")
    .select(
      `id, title, body_html, status, signing_token, signed_at, expires_at, studio_id,
       signature_image_url, signed_name,
       studio_signed_at, studio_signed_name, studio_signature_image_url,
       project:projects(name, event_type, event_date, client:clients(name, email))`,
    )
    .eq("signing_token", params.token)
    .is("deleted_at", null)
    .maybeSingle()

  const contract = contractRaw as ContractRow | null
  if (!contract) notFound()

  const projectRaw = pickFirst(contract.project as unknown) as
    | {
        name?: string | null
        event_type?: string | null
        event_date?: string | null
        client?: unknown
      }
    | null
  const project = projectRaw
  const client = pickFirst(projectRaw?.client as unknown) as
    | { name?: string | null; email?: string | null }
    | null

  const { data: studio } = await supabase
    .from("studios")
    .select("name, logo_url")
    .eq("id", contract.studio_id as string)
    .maybeSingle()

  const status = contract.status as string
  const signedAt = contract.signed_at as string | null
  const expiresAt = contract.expires_at as string | null

  // Ya firmado por el cliente — mostrar vista de "ya firmado"
  if (status === "signed") {
    return (
      <SignedConfirmation
        signedAt={signedAt}
        title={contract.title as string}
      />
    )
  }

  // Anulado o expirado
  if (
    status === "voided" ||
    status === "cancelled" ||
    status === "expired" ||
    (expiresAt && new Date() > new Date(expiresAt))
  ) {
    return <InvalidLink />
  }

  // Renderizar body con placeholders + firma del studio (si ya firmó)
  const { vars } = await buildContractPlaceholders(contract.id as string)
  const rendered = renderPlaceholders((contract.body_html as string) ?? "", vars)
  const finalHtml = injectSignatures(
    rendered,
    {
      imageUrl: contract.signature_image_url as string | null,
      name: contract.signed_name as string | null,
      signedAt,
    },
    {
      imageUrl: contract.studio_signature_image_url as string | null,
      name: contract.studio_signed_name as string | null,
      signedAt: contract.studio_signed_at as string | null,
    },
  )

  return (
    <ContractSigningView
      token={params.token}
      contract={{
        id: contract.id as string,
        title: contract.title as string,
        bodyHtml: finalHtml,
        status,
        expiresAt: expiresAt ?? undefined,
        clientName: client?.name ?? "Cliente",
        clientEmail: client?.email ?? undefined,
        projectName: project?.name ?? "Proyecto",
        eventDate: project?.event_date ?? undefined,
        studioName: studio?.name ?? "Studio",
        studioLogoUrl: studio?.logo_url ?? undefined,
      }}
    />
  )
}

function SignedConfirmation({
  signedAt,
  title,
}: {
  signedAt: string | null
  title: string
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
          <svg
            className="h-8 w-8 text-emerald-600 dark:text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Contrato firmado
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {title} fue firmado{" "}
          {signedAt
            ? `el ${new Date(signedAt).toLocaleDateString("es", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}`
            : "anteriormente"}
          . Te enviamos una copia por email.
        </p>
      </div>
    </div>
  )
}

function InvalidLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20">
          <svg
            className="h-8 w-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Enlace no válido
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Este enlace de firma expiró o fue anulado. Contactá a tu fotógrafo.
        </p>
      </div>
    </div>
  )
}
