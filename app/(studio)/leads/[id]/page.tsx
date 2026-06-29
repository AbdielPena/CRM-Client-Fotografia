import { notFound } from "next/navigation"
import { requireStudioAuth } from "@/server/middleware/auth"
import { getLeadById } from "@/server/services/lead.service"
import { getSelectionByLead } from "@/server/services/dress-catalog.service"
import { SelectionView } from "@/components/dresses/selection-view"
import { getEntityActivity } from "@/server/services/activity.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { StatusBadge } from "@/components/shared/status-badge"
import { LeadDetailActions } from "@/components/leads/lead-detail-actions"
import { NoteForm } from "@/components/shared/note-form"
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils/currency"
import {
  Mail,
  Phone,
  Calendar,
  DollarSign,
  Tag,
  Clock,
} from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detalle del lead" }

const STATUS_OPTIONS = [
  { value: "new", label: "Nuevo" },
  { value: "contacted", label: "Contactado" },
  { value: "meeting_scheduled", label: "Reunión agendada" },
  { value: "proposal_sent", label: "Propuesta enviada" },
  { value: "negotiating", label: "Negociando" },
  { value: "won", label: "Ganado" },
  { value: "lost", label: "Perdido" },
  { value: "archived", label: "Archivado" },
]

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const session = await requireStudioAuth()

  const [lead, activity, unread, dressSelection] = await Promise.all([
    getLeadById(session.studioId, params.id),
    getEntityActivity(session.studioId, "lead", params.id),
    countUnreadNotifications(session.studioId),
    getSelectionByLead(session.studioId, params.id),
  ])

  if (!lead) notFound()

  const notes = (lead.notes ?? []) as Array<Record<string, unknown>>
  const eventType = lead.event_type as string | null
  const eventDate = lead.event_date as string | null
  const budget = lead.budget as number | string | null
  const currency = (lead.currency as string | null) ?? "DOP"
  const source = lead.source as string | null
  const status = lead.status as string
  const createdAt = lead.created_at as string
  const updatedAt = lead.updated_at as string
  const convertedAt = lead.converted_at as string | null
  const convertedToClientId = lead.converted_to_client_id as string | null

  return (
    <>
      <AppTopbar
        eyebrow="Pipeline de leads"
        title={lead.name as string}
        description={eventType ? `${eventType} · ${status}` : status}
        unreadNotifications={unread}
        actions={
          <>
            <StatusBadge status={status} />
            <LeadDetailActions
              lead={{
                id: lead.id as string,
                name: lead.name as string,
                status,
                converted_to_client_id: convertedToClientId,
              }}
            />
          </>
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Selección de vestidos (si la clienta armó una en la web) */}
          {dressSelection && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-foreground">
                Vestidos seleccionados por la clienta
              </h2>
              <SelectionView selection={dressSelection} showHeader={false} />
            </div>
          )}

          {/* Contact info card */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Información de contacto</h2>
            <dl className="space-y-3">
              {lead.email ? (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a
                    href={`mailto:${String(lead.email)}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {String(lead.email)}
                  </a>
                </div>
              ) : null}
              {lead.phone ? (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a
                    href={`tel:${String(lead.phone)}`}
                    className="text-sm text-foreground hover:text-brand"
                  >
                    {String(lead.phone)}
                  </a>
                </div>
              ) : null}
              {eventDate && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-foreground">
                    {formatDate(eventDate)}
                  </span>
                </div>
              )}
              {budget != null && (
                <div className="flex items-center gap-3">
                  <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-foreground">
                    {formatCurrency(Number(budget), currency)} presupuesto estimado
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-foreground capitalize">
                  Fuente: {source ? source.toLowerCase().replace(/_/g, " ") : "No especificada"}
                </span>
              </div>
            </dl>
          </div>

          {/* Notes */}
          {lead.notes && typeof lead.notes === "string" && (
            <div className="sf-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">Notas del lead</h2>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                {String(lead.notes)}
              </p>
            </div>
          )}

          {/* Internal notes */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Notas internas</h2>
            <NoteForm entityType="lead" entityId={lead.id as string} />

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
          {/* Status change */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Cambiar estado</h2>
            <div className="space-y-1">
              {STATUS_OPTIONS.map((opt) => (
                <LeadStatusButton
                  key={opt.value}
                  leadId={lead.id as string}
                  value={opt.value}
                  label={opt.label}
                  current={status === opt.value}
                />
              ))}
            </div>
          </div>

          {/* Activity */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Actividad reciente</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
            ) : (
              <div className="space-y-3">
                {(activity as unknown[]).map((log: unknown) => {
                  const l = log as Record<string, unknown>
                  return (
                    <div key={String(l.id)} className="flex items-start gap-2">
                      <div className="w-6 h-6 bg-muted/60 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-xs text-foreground">
                          {String(l.action ?? "")
                            .replace("lead.", "")
                            .replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateShort(new Date(String(l.created_at)))}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="sf-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Información</h2>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Creado</dt>
                <dd className="text-foreground">{formatDateShort(new Date(createdAt))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Actualizado</dt>
                <dd className="text-foreground">{formatDateShort(new Date(updatedAt))}</dd>
              </div>
              {convertedAt && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Convertido</dt>
                  <dd className="text-foreground">
                    {formatDateShort(new Date(convertedAt))}
                  </dd>
                </div>
              )}
              {convertedToClientId && (
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground">Cliente</dt>
                  <dd>
                    <Link
                      href={`/clients/${convertedToClientId}`}
                      className="text-primary hover:underline"
                    >
                      Ver cliente →
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}

// Server component button that submits status update
function LeadStatusButton({
  leadId,
  value,
  label,
  current,
}: {
  leadId: string
  value: string
  label: string
  current: boolean
}) {
  return (
    <form
      action={async () => {
        "use server"
        const { requireStudioAuth } = await import("@/server/middleware/auth")
        const { updateLeadStatus } = await import("@/server/services/lead.service")
        const { revalidatePath } = await import("next/cache")
        const session = await requireStudioAuth()
        await updateLeadStatus(session.studioId, session.userId, leadId, value)
        revalidatePath(`/leads/${leadId}`)
        revalidatePath("/leads")
      }}
    >
      <button
        type="submit"
        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
          current
            ? "bg-brand text-brand-foreground font-medium"
            : "text-foreground/80 hover:bg-muted"
        }`}
      >
        {label}
      </button>
    </form>
  )
}
