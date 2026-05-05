/**
 * Página print-friendly del contrato.
 * Auth: usa la cookie del portal del cliente (si lo abre el cliente) o la
 * sesión del studio (si lo abre el admin). Cualquiera con acceso al contrato
 * puede ver la versión printable.
 *
 * El user genera el PDF con Ctrl+P (o "Imprimir → Guardar como PDF").
 * CSS optimizado para A4 con márgenes razonables y firmas inline.
 */

import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { requireStudioAuth } from "@/server/middleware/auth"
import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import {
  buildContractPlaceholders,
  injectSignatures,
  renderPlaceholders,
} from "@/server/services/contract-placeholders.service"
import { ContractPrintActions } from "@/components/contracts/contract-print-actions"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Contrato — versión imprimible" }

export default async function ContractPrintPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createSupabaseServiceClient()

  // Cargar contrato
  const { data: contract } = await supabase
    .from("contracts")
    .select(
      `id, studio_id, project_id, title, body_html, body_snapshot, status, created_at,
       signed_at, signed_name, signature_image_url,
       studio_signed_at, studio_signed_name, studio_signature_image_url,
       project:projects(name, event_type, event_date, event_location, client_id, client:clients(name, email))`,
    )
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle()
  if (!contract) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = contract as any

  // Auth: aceptar studio member O cliente del portal con client_id matching
  const isStudio = await checkStudioAccess(c.studio_id as string)
  const portalSession = parsePortalCookieValue(
    cookies().get(PORTAL_COOKIE_NAME)?.value,
  )
  const project = pickOne(c.project)
  const projectClientId = (project as { client_id?: string } | null)?.client_id
  const isClient =
    portalSession && projectClientId && portalSession.clientId === projectClientId

  if (!isStudio && !isClient) {
    notFound()
  }

  // Render con placeholders + firmas
  const { vars } = await buildContractPlaceholders(c.id as string)
  const baseBody = (c.body_snapshot as string | null) ?? (c.body_html as string | null) ?? ""
  const rendered = renderPlaceholders(baseBody, vars)
  const finalHtml = injectSignatures(
    rendered,
    {
      imageUrl: c.signature_image_url as string | null,
      name: c.signed_name as string | null,
      signedAt: c.signed_at as string | null,
    },
    {
      imageUrl: c.studio_signature_image_url as string | null,
      name: c.studio_signed_name as string | null,
      signedAt: c.studio_signed_at as string | null,
    },
  )

  // Studio para header
  const { data: studioRow } = await supabase
    .from("studios")
    .select("name, logo_url, address, phone, email")
    .eq("id", c.studio_id as string)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studio = studioRow as any

  const client = project ? pickOne((project as { client?: unknown }).client) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cl = client as any

  return (
    <div className="bg-white min-h-screen">
      <style>{`
        @page {
          size: A4;
          margin: 18mm 16mm;
        }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .contract-page { box-shadow: none !important; padding: 0 !important; }
        }
        body { background: #f4f4f5; color: #18181b; }
        .contract-page {
          max-width: 210mm;
          margin: 24px auto;
          background: white;
          padding: 32px 36px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          border-radius: 4px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          font-size: 13px;
          line-height: 1.65;
          color: #27272a;
        }
        .contract-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e4e4e7;
          margin-bottom: 24px;
        }
        .contract-header h1 {
          font-size: 18px;
          margin: 0 0 4px;
          color: #18181b;
        }
        .contract-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
          padding: 12px;
          background: #fafafa;
          border-radius: 4px;
          font-size: 12px;
        }
        .contract-meta dt {
          font-weight: 600;
          color: #71717a;
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: .04em;
        }
        .contract-meta dd { margin: 2px 0 0; color: #18181b; }
        .contract-body img { max-width: 100%; }
        .contract-footer {
          margin-top: 28px;
          padding-top: 12px;
          border-top: 1px solid #e4e4e7;
          font-size: 11px;
          color: #a1a1aa;
          text-align: center;
        }
      `}</style>

      <div className="no-print mx-auto max-w-[210mm] px-4 pt-4">
        <ContractPrintActions />
      </div>

      <article className="contract-page">
        <header className="contract-header">
          <div>
            <h1>{c.title}</h1>
            <p style={{ margin: 0, fontSize: 12, color: "#71717a" }}>
              {studio?.name ?? "Estudio"}
            </p>
          </div>
          {studio?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={studio.logo_url}
              alt={studio.name}
              style={{ maxHeight: 48, maxWidth: 120, objectFit: "contain" }}
            />
          ) : null}
        </header>

        <dl className="contract-meta">
          <div>
            <dt>Cliente</dt>
            <dd>{cl?.name ?? "—"}</dd>
            {cl?.email && <dd style={{ color: "#71717a" }}>{cl.email}</dd>}
          </div>
          <div>
            <dt>Proyecto</dt>
            <dd>{(project as { name?: string } | null)?.name ?? "—"}</dd>
            {(project as { event_date?: string } | null)?.event_date && (
              <dd style={{ color: "#71717a" }}>
                {new Date(
                  (project as { event_date: string }).event_date,
                ).toLocaleDateString("es", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </dd>
            )}
          </div>
        </dl>

        <div
          className="contract-body"
          dangerouslySetInnerHTML={{ __html: finalHtml }}
        />

        <footer className="contract-footer">
          {studio?.address ?? ""} {studio?.phone ? `· ${studio.phone}` : ""}{" "}
          {studio?.email ? `· ${studio.email}` : ""}
        </footer>
      </article>
    </div>
  )
}

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

async function checkStudioAccess(studioId: string): Promise<boolean> {
  try {
    const session = await requireStudioAuth()
    return session.studioId === studioId
  } catch {
    return false
  }
}
