import { notFound } from "next/navigation"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { ContractSigningView } from "@/components/public/contract-signing-view"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Firma de contrato" }

type ContractRow = {
  id: string
  title: string
  body_html: string | null
  status: string
  signing_token: string
  signed_at: string | null
  expires_at: string | null
  studio_id: string
  project: unknown
}

export default async function ContractSigningPage({ params }: { params: { token: string } }) {
  const supabase = createSupabaseServiceClient()

  // Contract sin relación directa a studio en schema → se resuelve en dos pasos.
  // Cast porque la join inference de supabase-js tipa como `never` cuando se
  // combinan relaciones anidadas con filtros compuestos.
  const { data: contractRaw } = await supabase
    .from("contracts")
    .select(
      `id, title, body_html, status, signing_token, signed_at, expires_at, studio_id,
       project:projects(name, event_type, event_date, client:clients(name, email))`,
    )
    .eq("signing_token", params.token)
    .is("deleted_at", null)
    .maybeSingle()

  const contract = contractRaw as ContractRow | null

  if (!contract) notFound()

  const projectRaw = pickFirst(contract.project as unknown) as
    | { name?: string | null; event_type?: string | null; event_date?: string | null; client?: unknown }
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

  // Ya firmado
  if (status === "signed") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Contrato firmado</h1>
          <p className="text-sm text-gray-500">
            Este contrato ya fue firmado el{" "}
            {signedAt
              ? new Date(signedAt).toLocaleDateString("es", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "una fecha anterior"}
            .
          </p>
        </div>
      </div>
    )
  }

  // Anulado o expirado
  if (status === "voided" || (expiresAt && new Date() > new Date(expiresAt))) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Enlace no válido</h1>
          <p className="text-sm text-gray-500">
            Este enlace de firma ha expirado o fue anulado. Contacta a tu fotógrafo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ContractSigningView
      token={params.token}
      contract={{
        id: contract.id as string,
        title: contract.title as string,
        body: (contract.body_html as string | null) ?? "",
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

function pickFirst(v: unknown) {
  if (!v) return null
  if (Array.isArray(v)) return v[0] ?? null
  return v
}
