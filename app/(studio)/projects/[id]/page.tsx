import { notFound } from "next/navigation"
import { requireStudioAuth } from "@/server/middleware/auth"
import { getProjectById } from "@/server/services/project.service"
import { listFormResponsesForProject } from "@/server/services/form.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { StatusBadge } from "@/components/shared/status-badge"
import { NoteForm } from "@/components/shared/note-form"
import { ProjectDetailActions } from "@/components/projects/project-detail-actions"
import { FormResponsesPanel } from "@/components/admin/form-responses-panel"
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils/currency"
import {
  Calendar,
  MapPin,
  DollarSign,
  FileText,
  Receipt,
  Clock,
} from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detalle del proyecto" }

const TYPE_LABELS: Record<string, string> = {
  wedding: "Boda",
  portrait: "Retrato",
  family: "Familia",
  corporate: "Corporativo",
  quinceañera: "Quinceañera",
  xv_años: "XV años",
  newborn: "Recién nacido",
  event: "Evento",
  other: "Otro",
}

type Rec = Record<string, unknown>

function pickFirst(v: unknown): Rec | null {
  if (!v) return null
  if (Array.isArray(v)) return (v[0] as Rec | undefined) ?? null
  return v as Rec
}

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const session = await requireStudioAuth()
  const [project, unread] = await Promise.all([
    getProjectById(session.studioId, params.id) as Promise<Rec | null>,
    countUnreadNotifications(session.studioId),
  ])

  if (!project) notFound()

  const client = pickFirst(project.client)
  const pkg = pickFirst(project.package)
  const invoices = (project.invoices ?? []) as Rec[]
  const contracts = (project.contracts ?? []) as Rec[]
  const notes = (project.notes ?? []) as Rec[]

  const formResponses = await listFormResponsesForProject({
    studioId: session.studioId,
    projectId: project.id as string,
    bookingRequestId: (project.booking_request_id as string | null) ?? null,
  })

  const publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""

  const eventType = (project.event_type as string | null) ?? null
  const eventDate = (project.event_date as string | null) ?? null
  const eventTime = (project.event_time as string | null) ?? null
  const totalAmount = project.total_amount as number | string | null
  const currency = (project.currency as string | null) ?? "DOP"

  const clientLabel = client ? (client.name as string) : ""

  return (
    <>
      <AppTopbar
        eyebrow="Proyectos"
        title={project.name as string}
        description={[TYPE_LABELS[eventType ?? ""] ?? eventType, clientLabel].filter(Boolean).join(" · ") || "Detalle del proyecto"}
        unreadNotifications={unread}
        actions={
          <>
            <StatusBadge status={project.status as string} />
            <ProjectDetailActions
              project={{
                id: project.id as string,
                name: project.name as string,
                client_id: (project.client_id as string | undefined) ?? undefined,
              }}
            />
          </>
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          {/* Event details */}
          <div className="sf-card">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border/60">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Evento</h2>
            </div>

            {!eventDate ? (
              <div className="py-8 text-center">
                <Calendar className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Sin fecha definida todavía</p>
              </div>
            ) : (
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="w-12 h-12 bg-muted/30 rounded-lg flex flex-col items-center justify-center flex-shrink-0 border border-border/60">
                  <span className="text-sm font-bold text-foreground leading-none">
                    {new Date(eventDate).getDate()}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase mt-0.5">
                    {new Date(eventDate).toLocaleString("es", { month: "short" })}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {formatDate(new Date(eventDate))}
                  </p>
                  {eventTime && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" /> {eventTime}
                    </p>
                  )}
                  {project.location ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" /> {String(project.location)}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {/* Formularios del cliente */}
          <FormResponsesPanel
            responses={formResponses}
            publicBaseUrl={publicBaseUrl}
          />

          {/* Notes */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Notas internas</h2>
            <NoteForm entityType="project" entityId={project.id as string} />

            <div className="mt-4 space-y-3">
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin notas todavía.</p>
              ) : (
                notes.map((note) => (
                  <div key={String(note.id)} className="border-l-2 border-border pl-3 py-1">
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {String(note.content ?? "")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateShort(new Date(String(note.created_at)))}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Project details */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Detalles</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <span className="text-foreground">
                  {(project.location as string | null) ?? "Sin ubicación"}
                </span>
              </div>
              {eventDate && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-foreground">{formatDate(new Date(eventDate))}</span>
                </div>
              )}
              {totalAmount != null && (
                <div className="flex items-start gap-3">
                  <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-foreground font-medium">
                    {formatCurrency(Number(totalAmount), currency)}
                  </span>
                </div>
              )}
              {pkg && (
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-foreground">{String(pkg.name)}</span>
                </div>
              )}
            </dl>
          </div>

          {/* Finance summary */}
          {invoices.length > 0 && (
            <div className="sf-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Finanzas</h2>
              </div>
              <div className="space-y-2">
                {invoices.map((invoice) => (
                  <Link
                    key={String(invoice.id)}
                    href={`/invoices/${invoice.id}`}
                    className="flex items-center justify-between py-2 hover:text-primary transition-colors"
                  >
                    <span className="text-xs text-foreground/80">
                      Factura #{String(invoice.invoice_number ?? "")}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {formatCurrency(
                          Number(invoice.total ?? 0),
                          (invoice.currency as string | null) ?? "DOP",
                        )}
                      </span>
                      <StatusBadge status={String(invoice.status)} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Contract status */}
          {contracts.length > 0 && (
            <div className="sf-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Contrato</h2>
              </div>
              <Link href={`/contracts/${contracts[0].id}`} className="inline-block">
                <StatusBadge status={String(contracts[0].status)} />
              </Link>
            </div>
          )}

          {/* Meta */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Información</h2>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Creado</dt>
                <dd className="text-foreground">
                  {formatDateShort(new Date(String(project.created_at)))}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Actualizado</dt>
                <dd className="text-foreground">
                  {formatDateShort(new Date(String(project.updated_at)))}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
