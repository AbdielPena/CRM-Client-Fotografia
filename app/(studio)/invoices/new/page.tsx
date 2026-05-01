import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { InvoiceBuilder } from "@/components/invoices/invoice-builder"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Nueva factura" }

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: { projectId?: string; clientId?: string }
}) {
  const session = await requireStudioAuth()
  const supabase = createSupabaseServerClient()

  const [projectsRes, clientsRes, unread] = await Promise.all([
    supabase
      .from("projects")
      .select(
        `id, name, client_id, total_amount, currency, client:clients(id, name)`,
      )
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("clients")
      .select("id, name")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    countUnreadNotifications(session.studioId),
  ])

  type ProjectQueryRow = Record<string, unknown> & {
    id: string
    name: string
    client_id: string
    total_amount: number | string | null
    currency: string | null
    client: unknown
  }
  const projects = ((projectsRes.data ?? []) as ProjectQueryRow[]).map((p: ProjectQueryRow) => {
    const clientRow = Array.isArray(p.client)
      ? (p.client[0] as { id?: string; name?: string } | undefined)
      : (p.client as { id?: string; name?: string } | null)
    return {
      id: p.id as string,
      name: p.name as string,
      clientId: p.client_id as string,
      clientName: clientRow?.name ?? "Sin cliente",
      totalAmount: p.total_amount ? Number(p.total_amount) : undefined,
      currency: (p.currency as string) ?? "DOP",
    }
  })

  return (
    <>
      <AppTopbar
        eyebrow="Facturas"
        title="Nueva factura"
        description="Crea y envía una factura profesional"
        unreadNotifications={unread}
      />
      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <InvoiceBuilder
          projects={projects}
          clients={clientsRes.data ?? []}
          defaultProjectId={searchParams.projectId}
          defaultClientId={searchParams.clientId}
        />
      </div>
    </>
  )
}
