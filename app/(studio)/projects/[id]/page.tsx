import { notFound } from "next/navigation"
import { requireStudioAuth } from "@/server/middleware/auth"
import { getProjectById } from "@/server/services/project.service"
import { listFormResponsesForProject } from "@/server/services/form.service"
import { getEntityActivity } from "@/server/services/activity.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { getAssetThumbUrl } from "@/server/services/gallery.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { StatusBadge } from "@/components/shared/status-badge"
import { NoteForm } from "@/components/shared/note-form"
import { ProjectDetailActions } from "@/components/projects/project-detail-actions"
import { ClientPortalAccessCard } from "@/components/projects/client-portal-access-card"
import { ensureClientAccessCode } from "@/server/services/client-portal.service"
import { WhatsAppSendMenu } from "@/components/whatsapp/whatsapp-send-menu"
import { FormResponsesPanel } from "@/components/admin/form-responses-panel"
import {
  listProjectCollaborators,
  listCollaborators,
} from "@/server/services/collaborator.service"
import { ProjectCollaboratorsCard } from "@/components/collaborators/project-collaborators-card"
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils/currency"
import {
  Calendar,
  MapPin,
  DollarSign,
  FileText,
  Receipt,
  Clock,
  CreditCard,
  Truck,
  History,
  Image as ImageIcon,
  User,
  Mail,
  Phone,
  Instagram,
  Globe,
  FolderOpen,
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
  // Optimización: las 3 queries en paralelo en lugar de project→formResponses
  // secuencial. listFormResponsesForProject usa params.id directamente —
  // no necesita esperar a project. Si el project no existe igual el
  // formResponses devolverá [] sin error, y luego notFound() corta.
  const [project, unread, formResponsesEarly] = await Promise.all([
    getProjectById(session.studioId, params.id) as Promise<Rec | null>,
    countUnreadNotifications(session.studioId),
    listFormResponsesForProject({
      studioId: session.studioId,
      projectId: params.id,
      bookingRequestId: null,
    }).catch(() => []),
  ])

  if (!project) notFound()

  const client = pickFirst(project.client)
  const pkg = pickFirst(project.package)
  const invoices = (project.invoices ?? []) as Rec[]
  const contracts = (project.contracts ?? []) as Rec[]
  const notes = (project.notes ?? []) as Rec[]

  // Galerías del proyecto (si están vinculadas)
  const supabase = createSupabaseServiceClient()
  const { data: galleriesRaw } = await supabase
    .from("galleries")
    .select("id, name, status, asset_count, cover_asset_id, created_at, gallery_type, delivery_ready_at")
    .eq("studio_id", session.studioId)
    .eq("project_id", params.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const galleries = (galleriesRaw ?? []) as any[]
  const coverIds = galleries
    .map((g) => g.cover_asset_id as string | null)
    .filter(Boolean) as string[]
  const coverThumbs: Record<string, string | null> = {}
  if (coverIds.length > 0) {
    const { data: coverRows } = await supabase
      .from("gallery_assets")
      .select("id, thumb_key")
      .in("id", coverIds)
    for (const r of (coverRows ?? []) as Array<{
      id: string
      thumb_key: string | null
    }>) {
      coverThumbs[r.id] = getAssetThumbUrl(r.thumb_key)
    }
  }

  // La tabla `projects` NO tiene columna booking_request_id — la relación es
  // INVERSA (booking_requests.project_id). Resolvemos el booking que apunta a
  // este proyecto para incluir sus form_responses (también cubre forms
  // históricos que quedaron ligados solo por booking_request_id).
  const { data: brRow } = await supabase
    .from("booking_requests")
    .select("id")
    .eq("studio_id", session.studioId)
    .eq("project_id", params.id)
    .is("deleted_at", null)
    .maybeSingle()
  const bookingRequestId = (brRow as { id?: string } | null)?.id ?? null
  const formResponses = bookingRequestId
    ? await listFormResponsesForProject({
        studioId: session.studioId,
        projectId: project.id as string,
        bookingRequestId,
      })
    : formResponsesEarly

  // Pagos, entregas, historial e (otros proyectos del mismo cliente)
  const clientId = (client?.id as string | undefined) ?? null

  // Código de acceso al portal (se genera si no existe — idempotente).
  let portalAccessCode: string | null = null
  if (clientId) {
    try {
      portalAccessCode = await ensureClientAccessCode(session.studioId, clientId)
    } catch {
      portalAccessCode = null
    }
  }
  const portalLoginUrl = `${(process.env["NEXT_PUBLIC_APP_URL"] ?? "").replace(/\/$/, "")}/portal/login`
  const [
    { data: paymentsRaw },
    { data: deliveriesRaw },
    activity,
    { data: otherProjectsRaw },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, amount, currency, status, method, received_at, created_at, invoice_id",
      )
      .eq("studio_id", session.studioId)
      .eq("project_id", params.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("client_deliveries")
      .select("id, title, status, delivered_at, gallery_id, created_at")
      .eq("studio_id", session.studioId)
      .eq("project_id", params.id)
      .order("created_at", { ascending: false }),
    getEntityActivity(session.studioId, "project", params.id),
    clientId
      ? supabase
          .from("projects")
          .select("id, name, status, event_type, event_date")
          .eq("studio_id", session.studioId)
          .eq("client_id", clientId)
          .neq("id", params.id)
          .is("deleted_at", null)
          .order("event_date", { ascending: false, nullsFirst: false })
          .limit(8)
      : Promise.resolve({ data: [] as Rec[] }),
  ])
  const payments = (paymentsRaw ?? []) as Rec[]
  const deliveries = (deliveriesRaw ?? []) as Rec[]
  const otherProjects = (otherProjectsRaw ?? []) as Rec[]

  // Colaboradores del proyecto + roster del estudio (para asignar) + costo total.
  const [projCollabRows, rosterRows] = await Promise.all([
    listProjectCollaborators(session.studioId, params.id).catch(() => []),
    listCollaborators(session.studioId).catch(() => []),
  ])
  const projectCollaborators = projCollabRows.map((a) => ({
    id: a.id,
    role: a.role,
    agreedPay: Number(a.agreed_pay ?? 0),
    payStatus: a.pay_status,
    confirmStatus: a.confirm_status,
    serviceDate: a.service_date,
    paymentMethod: a.payment_method,
    notes: a.notes,
    collaborator: a.collaborator
      ? { id: a.collaborator.id, name: a.collaborator.name, type: a.collaborator.type }
      : null,
  }))
  const collaboratorRoster = rosterRows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
  }))
  const collaboratorCost = projectCollaborators
    .filter((a) => a.payStatus !== "cancelled")
    .reduce((s, a) => s + a.agreedPay, 0)

  // Total pagado (suma de pagos completados/recibidos) — visión financiera del cliente
  const totalPaid = payments
    .filter((p) => ["completed", "received", "paid", "succeeded"].includes(String(p.status)))
    .reduce((s, p) => s + Number(p.amount ?? 0), 0)

  const publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""

  const eventType = (project.event_type as string | null) ?? null
  const eventDate = (project.event_date as string | null) ?? null
  const eventTime = (project.event_time as string | null) ?? null
  const totalAmount = project.total_amount as number | string | null
  const currency = (project.currency as string | null) ?? "DOP"

  // Ganancia neta del proyecto = ingreso (precio del proyecto, o lo pagado si no
  // hay precio) − costo de colaboradores (pagos acordados no cancelados).
  const projectIncome = totalAmount != null ? Number(totalAmount) : totalPaid
  const netProfit = projectIncome - collaboratorCost

  const clientLabel = client ? (client.name as string) : ""

  // WhatsApp de 1 clic (hub del cliente)
  const waPhone =
    (client?.phone as string | null) ?? (client?.whatsapp as string | null) ?? null
  const waVars = {
    clienteNombre: clientLabel || null,
    fecha: eventDate ? formatDate(new Date(eventDate)) : null,
    lugar: (project.location as string | null) ?? null,
    link: invoices[0]
      ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/i/${invoices[0].id}`
      : null,
  }

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
            <WhatsAppSendMenu phone={waPhone} vars={waVars} />
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
                <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
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

          {/* Galerías del proyecto */}
          <div className="sf-card">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Galerías ({galleries.length})
                </h2>
              </div>
              <Link
                href={`/galleries/new?projectId=${project.id}${client?.id ? `&clientId=${client.id}` : ""}`}
                className="text-xs font-medium text-primary hover:text-primary/80"
              >
                + Nueva galería
              </Link>
            </div>
            {galleries.length === 0 ? (
              <div className="py-8 text-center">
                <ImageIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Sin galerías vinculadas a este proyecto
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
                {galleries.map((g) => {
                  const cover = g.cover_asset_id ? coverThumbs[g.cover_asset_id] : null
                  return (
                    <Link
                      key={g.id}
                      href={`/galleries/${g.id}`}
                      className="group overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
                    >
                      <div className="relative aspect-[4/3] bg-muted">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cover}
                            alt={g.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-6 w-6" />
                          </div>
                        )}
                        <span className="absolute right-1.5 top-1.5">
                          <StatusBadge status={String(g.status)} />
                        </span>
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary">
                          {g.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span
                            className={
                              g.delivery_ready_at
                                ? "inline-flex rounded-full bg-brand-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-brand"
                                : "inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground"
                            }
                          >
                            {g.delivery_ready_at ? "Entrega lista" : "Selección"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {g.asset_count ?? 0} foto
                            {(g.asset_count ?? 0) === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Colaboradores del proyecto */}
          <ProjectCollaboratorsCard
            projectId={project.id as string}
            assignments={projectCollaborators}
            roster={collaboratorRoster}
            currency={currency}
          />

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

          {/* Historial de actividad del proyecto */}
          {activity.length > 0 && (
            <div className="sf-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <History className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Historial</h2>
              </div>
              <ol className="space-y-3">
                {[...activity].reverse().map((a) => (
                  <li key={String(a.id)} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60" />
                    <div className="min-w-0">
                      <p className="text-xs text-foreground">
                        {String(a.description ?? a.action ?? "Acción")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {a.actor_name ? `${String(a.actor_name)} · ` : ""}
                        {formatDateShort(new Date(String(a.created_at)))}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Perfil del cliente — este apartado funciona como hub del cliente */}
          {client && (
            <div className="sf-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Cliente</h2>
                </div>
                <Link
                  href={`/clients/${client.id}`}
                  className="text-xs font-medium text-primary hover:text-primary/80"
                >
                  Ver perfil →
                </Link>
              </div>

              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft text-base font-bold text-brand">
                  {(clientLabel || "?").charAt(0).toUpperCase()}
                </div>
                <Link href={`/clients/${client.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground hover:text-primary">
                    {clientLabel}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Ver historial completo
                  </span>
                </Link>
              </div>

              <dl className="space-y-2.5 text-xs">
                {client.email ? (
                  <div className="flex items-center gap-2.5">
                    <Mail className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <a
                      href={`mailto:${String(client.email)}`}
                      className="truncate text-foreground hover:text-primary"
                    >
                      {String(client.email)}
                    </a>
                  </div>
                ) : null}
                {client.phone || client.whatsapp ? (
                  <div className="flex items-center gap-2.5">
                    <Phone className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <a
                      href={`tel:${String(client.phone ?? client.whatsapp)}`}
                      className="text-foreground hover:text-primary"
                    >
                      {String(client.phone ?? client.whatsapp)}
                    </a>
                  </div>
                ) : null}
                {client.instagram_handle ? (
                  <div className="flex items-center gap-2.5">
                    <Instagram className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate text-foreground">
                      @{String(client.instagram_handle).replace(/^@/, "")}
                    </span>
                  </div>
                ) : null}
                {client.website_url ? (
                  <div className="flex items-center gap-2.5">
                    <Globe className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <a
                      href={String(client.website_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-foreground hover:text-primary"
                    >
                      {String(client.website_url).replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                ) : null}
              </dl>

              {totalPaid > 0 && (
                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                  <span className="text-muted-foreground">Pagado (este proyecto)</span>
                  <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(totalPaid, currency)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Acceso del cliente al portal */}
          {client && clientId && (
            <ClientPortalAccessCard
              clientId={clientId}
              clientEmail={(client.email as string | null) ?? null}
              accessCode={portalAccessCode}
              portalUrl={portalLoginUrl}
            />
          )}

          {/* Otros proyectos del cliente */}
          {otherProjects.length > 0 && (
            <div className="sf-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Otros proyectos del cliente ({otherProjects.length})
                </h2>
              </div>
              <div className="space-y-1">
                {otherProjects.map((p) => (
                  <Link
                    key={String(p.id)}
                    href={`/projects/${p.id}`}
                    className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">
                        {String(p.name)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {TYPE_LABELS[String(p.event_type ?? "")] ??
                          String(p.event_type ?? "")}
                        {p.event_date
                          ? ` · ${formatDateShort(new Date(String(p.event_date)))}`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge status={String(p.status)} />
                  </Link>
                ))}
              </div>
            </div>
          )}

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
                  <div className="min-w-0">
                    <span className="block text-foreground">{String(pkg.name)}</span>
                    {pkg.price != null && (
                      <span className="text-xs text-muted-foreground">
                        Paquete · {formatCurrency(Number(pkg.price), (pkg.currency as string) ?? currency)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </dl>
          </div>

          {/* Ganancia neta (ingreso − pagos a colaboradores) */}
          {projectCollaborators.length > 0 && (
            <div className="sf-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Ganancia neta</h2>
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ingreso del proyecto</dt>
                  <dd className="font-medium tabular-nums text-foreground">
                    {formatCurrency(projectIncome, currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Pagos a colaboradores</dt>
                  <dd className="font-medium tabular-nums text-rose-600 dark:text-rose-400">
                    − {formatCurrency(collaboratorCost, currency)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-2">
                  <dt className="font-semibold text-foreground">Ganancia neta</dt>
                  <dd
                    className={
                      netProfit >= 0
                        ? "font-bold tabular-nums text-emerald-600 dark:text-emerald-400"
                        : "font-bold tabular-nums text-rose-600 dark:text-rose-400"
                    }
                  >
                    {formatCurrency(netProfit, currency)}
                  </dd>
                </div>
              </dl>
            </div>
          )}

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

          {/* Pagos */}
          {payments.length > 0 && (
            <div className="sf-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Pagos</h2>
              </div>
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={String(p.id)} className="flex items-center justify-between py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {formatCurrency(Number(p.amount ?? 0), (p.currency as string) ?? currency)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {String(p.method ?? "").replace(/_/g, " ")}
                        {p.received_at
                          ? ` · ${formatDateShort(new Date(String(p.received_at)))}`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge status={String(p.status)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contrato — timeline con fechas reales */}
          {contracts.length > 0 &&
            (() => {
              const c = contracts[0]
              const rows: Array<[string, string | null]> = [
                ["Creado", (c.created_at as string | null) ?? null],
                ["Enviado", (c.sent_at as string | null) ?? null],
                ["Firmado", (c.signed_at as string | null) ?? null],
              ]
              return (
                <div className="sf-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <h2 className="text-sm font-semibold text-foreground">Contrato</h2>
                    </div>
                    <StatusBadge status={String(c.status)} />
                  </div>
                  <dl className="space-y-1.5 text-xs">
                    {rows.map(([label, val]) =>
                      val ? (
                        <div key={label} className="flex justify-between">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="text-foreground">
                            {formatDateShort(new Date(String(val)))}
                          </dd>
                        </div>
                      ) : null,
                    )}
                    {c.signed_name ? (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Firmante</dt>
                        <dd className="text-foreground">{String(c.signed_name)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <Link
                    href={`/contracts/${c.id}`}
                    className="mt-3 inline-block text-xs font-medium text-primary hover:text-primary/80"
                  >
                    Ver contrato →
                  </Link>
                </div>
              )
            })()}

          {/* Entregas */}
          {deliveries.length > 0 && (
            <div className="sf-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Entregas</h2>
              </div>
              <div className="space-y-2">
                {deliveries.map((d) => (
                  <div key={String(d.id)} className="flex items-center justify-between py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {String(d.title ?? "Entrega")}
                      </p>
                      {d.delivered_at ? (
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateShort(new Date(String(d.delivered_at)))}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge status={String(d.status)} />
                  </div>
                ))}
              </div>
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
