import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { ContractEditor } from "@/components/contracts/contract-editor"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Nuevo contrato" }

const DEFAULT_CONTRACT_BODY = `# CONTRATO DE SERVICIOS FOTOGRÁFICOS

Entre **{{studioName}}** (el Fotógrafo) y **{{clientName}}** (el Cliente).

## 1. Servicios

El Fotógrafo se compromete a proporcionar los siguientes servicios:
- Sesión fotográfica para {{eventType}}
- Fecha del evento: {{eventDate}}
- Lugar: {{location}}

## 2. Entregables

El Fotógrafo entregará:
- Fotografías editadas en alta resolución
- Galería digital privada para descarga
- Plazo de entrega: 4-6 semanas tras el evento

## 3. Pago

El precio acordado es de **{{totalAmount}}**.
- Depósito del 50% al firmar este contrato
- Saldo restante 7 días antes del evento

## 4. Cancelación

- Cancelación con más de 30 días: devolución del depósito menos gastos administrativos
- Cancelación con menos de 30 días: el depósito no es reembolsable

## 5. Derechos de imagen

El Fotógrafo podrá utilizar las fotografías para su portafolio y redes sociales salvo indicación expresa del Cliente.

## 6. Fuerza mayor

En caso de circunstancias fuera del control de ambas partes, se buscará una fecha alternativa sin penalización.

---

Al firmar este contrato, ambas partes confirman haber leído y aceptado los términos.`

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: { projectId?: string; clientId?: string }
}) {
  const session = await requireStudioAuth()
  const supabase = createSupabaseServerClient()

  const [projectsRes, templatesRes, unread] = await Promise.all([
    supabase
      .from("projects")
      .select(
        `id, name, client_id, event_type, event_date, location, total_amount, currency, client:clients(id, name)`,
      )
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("contract_templates")
      .select("id, name, body_html")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    countUnreadNotifications(session.studioId),
  ])

  type ProjectQueryRow = Record<string, unknown> & {
    id: string
    name: string
    client_id: string
    event_type: string | null
    event_date: string | null
    location: string | null
    total_amount: number | string | null
    currency: string | null
    client: unknown
  }
  type TemplateQueryRow = { id: string; name: string; body_html: string | null }

  const projects = ((projectsRes.data ?? []) as ProjectQueryRow[]).map((p: ProjectQueryRow) => {
    const clientRow = Array.isArray(p.client)
      ? (p.client[0] as { id?: string; name?: string } | undefined)
      : (p.client as { id?: string; name?: string } | null)
    return {
      id: p.id as string,
      name: p.name as string,
      clientId: p.client_id as string,
      clientName: clientRow?.name ?? "Sin cliente",
      type: (p.event_type as string | null) ?? "",
      eventDate: (p.event_date as string | null) ?? undefined,
      location: (p.location as string | null) ?? undefined,
      totalAmount: p.total_amount ? Number(p.total_amount) : undefined,
      currency: (p.currency as string) ?? "DOP",
    }
  })

  const templates = ((templatesRes.data ?? []) as TemplateQueryRow[]).map((t: TemplateQueryRow) => ({
    id: t.id as string,
    name: t.name as string,
    body: (t.body_html as string) ?? "",
  }))

  return (
    <>
      <AppTopbar
        eyebrow="Contratos"
        title="Nuevo contrato"
        description="Redacta y envía un contrato para firma digital"
        unreadNotifications={unread}
      />
      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <ContractEditor
          projects={projects}
          templates={templates}
          defaultProjectId={searchParams.projectId}
          defaultBody={DEFAULT_CONTRACT_BODY}
        />
      </div>
    </>
  )
}
