import { cookies } from "next/headers"
import Link from "next/link"
import { FileText, Pen, Printer } from "lucide-react"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { StatusBadge } from "@/components/shared/status-badge"
import { formatDateShort } from "@/lib/utils/currency"
import { PortalHeader, PortalEmpty } from "@/components/portal/portal-ui"

export const dynamic = "force-dynamic"

export default async function PortalContractsPage() {
  const session = parsePortalCookieValue(cookies().get(PORTAL_COOKIE_NAME)?.value)
  if (!session) return null

  const supabase = createSupabaseServiceClient()
  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("client_id", session.clientId)
  const projectIds = ((projects ?? []) as Array<{ id: string }>).map((p) => p.id)

  const { data: contractsRaw } =
    projectIds.length > 0
      ? await supabase
          .from("contracts")
          .select(
            "id, title, status, signed_at, sent_at, signing_token, expires_at, created_at",
          )
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contracts = (contractsRaw ?? []) as any[]

  return (
    <div className="space-y-8">
      <PortalHeader
        eyebrow="Documentos"
        title="Tus contratos"
        description="Revisa y firma los contratos que te envió tu fotógrafo."
      />

      {contracts.length === 0 ? (
        <PortalEmpty
          icon={FileText}
          title="Sin contratos todavía"
          description="Cuando tu fotógrafo te envíe un contrato, lo verás aquí para firmarlo."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {contracts.map((c, i) => {
            const signed = c.status === "signed"
            const canSign =
              c.signing_token &&
              !signed &&
              (!c.expires_at || new Date(c.expires_at).getTime() > Date.now())
            return (
              <div
                key={c.id}
                className="lx-card animate-fade-in-up p-5"
                style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        signed
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-brand-soft text-gold-600"
                      }`}
                    >
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{c.title}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {c.signed_at
                          ? `Firmado ${formatDateShort(new Date(c.signed_at))}`
                          : c.sent_at
                            ? `Enviado ${formatDateShort(new Date(c.sent_at))}`
                            : `Creado ${formatDateShort(new Date(c.created_at))}`}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={String(c.status)} />
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-4">
                  <Link
                    href={`/contract-print/${c.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-gold-300 hover:text-gold-700"
                  >
                    <Printer className="h-3 w-3" />
                    PDF
                  </Link>
                  {canSign && (
                    <Link
                      href={`/sign/${c.signing_token}`}
                      target="_blank"
                      className="lx-btn-gold !px-4 !py-1.5 text-xs"
                    >
                      <Pen className="h-3 w-3" />
                      Firmar
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
