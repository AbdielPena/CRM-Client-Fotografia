import { notFound } from "next/navigation"
import { requireStudioAuth } from "@/server/middleware/auth"
import { getContractById } from "@/server/services/contract.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { StatusBadge } from "@/components/shared/status-badge"
import { ContractDetailActions } from "@/components/contracts/contract-detail-actions"
import { ContractPreviewAndSign } from "@/components/contracts/contract-preview-and-sign"
import { CopyLinkButton } from "@/components/contracts/copy-link-button"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { formatDate, formatDateShort } from "@/lib/utils/currency"
import { FileText, User, Calendar, Link as LinkIcon } from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detalle del contrato" }

type Rec = Record<string, unknown>

function pickFirst(v: unknown): Rec | null {
  if (!v) return null
  if (Array.isArray(v)) return (v[0] as Rec | undefined) ?? null
  return v as Rec
}

export default async function ContractDetailPage({ params }: { params: { id: string } }) {
  const session = await requireStudioAuth()
  const [contractRaw, unread] = await Promise.all([
    getContractById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])
  const contract = contractRaw as Rec | null

  if (!contract) notFound()

  // Cargar si el studio tiene firma reusable (para mostrar el modal correcto)
  const supabase = createSupabaseServiceClient()
  const { data: studioRow } = await supabase
    .from("studios")
    .select("signature_image_url")
    .eq("id", session.studioId)
    .maybeSingle()
  const studioHasSignature = Boolean(
    (studioRow as { signature_image_url?: string | null } | null)?.signature_image_url,
  )
  const studioAlreadySigned = Boolean(contract.studio_signed_at)

  const client = pickFirst(contract.client)
  const project = pickFirst(contract.project)
  const template = pickFirst(contract.template)

  const status = contract.status as string
  const signingToken = contract.signing_token as string | null
  const signedAt = contract.signed_at as string | null
  const sentAt = contract.sent_at as string | null
  const expiresAt = contract.expires_at as string | null
  const createdAt = contract.created_at as string
  const bodyHtml = (contract.body_html as string | null) ?? ""
  const signedName = (contract.signed_name as string | null) ?? "—"
  const signedIp = contract.signed_ip as string | null
  const eventDate = (project?.event_date as string | null) ?? null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const signingUrl = signingToken ? `${appUrl}/sign/${signingToken}` : null

  return (
    <>
      <AppTopbar
        eyebrow="Contratos"
        title={contract.title as string}
        description={`${(client?.name as string | undefined) ?? "Sin cliente"} · ${(project?.name as string | undefined) ?? "Sin proyecto"}`}
        unreadNotifications={unread}
        actions={
          <>
            <StatusBadge status={status} />
            <ContractDetailActions
              contract={{
                id: contract.id as string,
                title: contract.title as string,
                status,
              }}
            />
          </>
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contract content */}
        <div className="lg:col-span-2">
          <div className="sf-card overflow-hidden">
            {/* Parties */}
            <div className="px-8 py-6 border-b border-border/60 grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Cliente</p>
                <p className="font-semibold text-foreground">
                  {(client?.name as string | undefined) ?? "—"}
                </p>
                {client?.email ? (
                  <p className="text-sm text-muted-foreground">{String(client.email)}</p>
                ) : null}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Proyecto</p>
                {project ? (
                  <Link
                    href={`/projects/${String(project.id)}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {String(project.name)}
                  </Link>
                ) : (
                  <p className="font-semibold text-foreground">—</p>
                )}
                {eventDate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(new Date(eventDate))}
                  </p>
                )}
              </div>
            </div>

            {/* Contract body con vista previa renderizada + firma del studio */}
            <div className="px-6 py-6">
              <ContractPreviewAndSign
                contractId={contract.id as string}
                rawBody={bodyHtml}
                studioHasSignature={studioHasSignature}
                studioAlreadySigned={studioAlreadySigned}
              />
            </div>

            {/* Signature block */}
            {status === "signed" && (
              <div className="px-8 py-6 border-t border-border/60 bg-emerald-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                    <FileText className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">
                      Firmado por {signedName}
                    </p>
                    <p className="text-xs text-emerald-600">
                      {signedAt ? formatDate(new Date(signedAt)) : "—"}
                      {signedIp && ` · IP: ${signedIp}`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Signing link */}
          {signingUrl && status === "sent" && (
            <div className="bg-brand-soft border border-blue-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <LinkIcon className="h-4 w-4 text-brand" />
                <h2 className="text-sm font-semibold text-blue-900">Enlace de firma</h2>
              </div>
              <p className="text-xs text-brand mb-3">
                Comparte este enlace con el cliente para que firme el contrato.
              </p>
              <div className="bg-card border border-blue-200 rounded-lg px-3 py-2">
                <code className="text-xs text-blue-800 break-all">{signingUrl}</code>
              </div>
              <CopyLinkButton url={signingUrl} />
            </div>
          )}

          {/* Details */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Detalles</h2>
            <dl className="space-y-3 text-sm">
              {client && (
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <Link
                    href={`/clients/${String(client.id)}`}
                    className="text-primary hover:underline"
                  >
                    {String(client.name)}
                  </Link>
                </div>
              )}
              {project && (
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <Link
                    href={`/projects/${String(project.id)}`}
                    className="text-foreground hover:text-primary"
                  >
                    {String(project.name)}
                  </Link>
                </div>
              )}
              {expiresAt && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">
                    Expira {formatDateShort(new Date(expiresAt))}
                  </span>
                </div>
              )}
              {template && (
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">
                    Basado en: {String(template.name)}
                  </span>
                </div>
              )}
            </dl>
          </div>

          {/* Timeline */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Historial</h2>
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-300 rounded-full" />
                <span className="text-muted-foreground">Creado</span>
                <span className="text-foreground ml-auto">
                  {formatDateShort(new Date(createdAt))}
                </span>
              </div>
              {sentAt && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full" />
                  <span className="text-muted-foreground">Enviado</span>
                  <span className="text-foreground ml-auto">
                    {formatDateShort(new Date(sentAt))}
                  </span>
                </div>
              )}
              {signedAt && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <span className="text-emerald-700 font-medium">Firmado</span>
                  <span className="text-emerald-700 ml-auto font-medium">
                    {formatDateShort(new Date(signedAt))}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
