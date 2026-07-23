import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import {
  Mail,
  Phone,
  MapPin,
  Instagram,
  Globe,
  FolderOpen,
  Heart,
  Truck,
  FileText,
  Receipt,
  CreditCard,
  CalendarCheck,
  Send,
  ExternalLink,
  MessageCircle,
  Printer,
  Archive,
} from "lucide-react"
import { formatDoPhone } from "@/lib/whatsapp/templates"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getClientById } from "@/server/services/client.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { untypedService } from "@/server/supabase/untyped"
import { getAssetThumbUrl } from "@/server/services/gallery.service"
import { listClientPrintOverview } from "@/server/services/print-selection.service"
import { getPrintWaTemplate } from "@/server/services/share-message.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { PrintRow } from "@/components/prints/print-overview-list"
import { StatusBadge } from "@/components/shared/status-badge"
import { CollapsibleCard } from "@/components/ui/collapsible-card"
import { NoteForm } from "@/components/shared/note-form"
import { ClientDetailActions } from "@/components/clients/client-detail-actions"
import { ClientCreatedToast } from "@/components/clients/client-created-toast"
import { DeleteClientButton } from "@/components/clients/delete-client-button"
import { PortalAccessCard } from "@/components/clients/portal-access-card"
import { DeliveriesPanel } from "@/components/clients/deliveries-panel"
import { EntityTasks } from "@/components/tasks/entity-tasks"
import {
  formatDate,
  formatDateShort,
  formatCurrency,
} from "@/lib/utils/currency"

export const metadata: Metadata = { title: "Perfil del cliente" }

const PROJECT_TYPE_LABELS: Record<string, string> = {
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

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const [client, unread] = await Promise.all([
    getClientById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])

  if (!client) notFound()

  const supabase = createSupabaseServiceClient()
  const allProjects = (client.projects ?? []) as Array<Record<string, unknown>>
  const notes = (client.notes_rel ?? []) as Array<Record<string, unknown>>
  const projectIds = allProjects.map((p) => String(p.id))

  // Banderas de finalización (columnas nuevas, fuera de los tipos generados):
  // se cargan con el cliente sin tipar y se mezclan a cada proyecto.
  const finalizedMap = new Map<string, { finalized_at: string | null; files_purged_at: string | null }>()
  if (projectIds.length > 0) {
    const { data: finRows } = await untypedService()
      .from("projects")
      .select("id, finalized_at, files_purged_at")
      .in("id", projectIds)
    for (const r of ((finRows ?? []) as Array<{
      id: string
      finalized_at: string | null
      files_purged_at: string | null
    }>)) {
      finalizedMap.set(String(r.id), {
        finalized_at: r.finalized_at ?? null,
        files_purged_at: r.files_purged_at ?? null,
      })
    }
  }
  for (const p of allProjects) {
    const f = finalizedMap.get(String(p.id))
    if (f) {
      p.finalized_at = f.finalized_at
      p.files_purged_at = f.files_purged_at
    }
  }
  // Sesiones finalizadas (archivadas): salen de la lista activa y viven en su
  // propio apartado "Finalizadas" con todo su historial. Los IDs siguen
  // contando para las secciones agregadas (facturas, pagos, totales).
  const projects = allProjects.filter((p) => !p.finalized_at)
  const finalizedProjects = allProjects.filter((p) => !!p.finalized_at)

  // Cargar todo lo relacionado en paralelo
  const [
    galleriesRes,
    invoicesRes,
    paymentsRes,
    bookingsRes,
    contractsRes,
    emailsRes,
  ] = await Promise.all([
    supabase
      .from("galleries")
      .select("id, name, status, asset_count, cover_asset_id, created_at, expires_at, gallery_type, delivery_ready_at")
      .eq("studio_id", session.studioId)
      .eq("client_id", params.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total, currency, due_date, created_at")
      .eq("studio_id", session.studioId)
      .eq("client_id", params.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("id, amount, currency, status, received_at, method, invoice_id, created_at")
      .eq("studio_id", session.studioId)
      .eq("client_id", params.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("booking_requests")
      .select("id, status, package_id, event_date, created_at")
      .eq("studio_id", session.studioId)
      .eq("client_id", params.id)
      .order("created_at", { ascending: false })
      .limit(20),
    projectIds.length > 0
      ? supabase
          .from("contracts")
          .select("id, title, status, signed_at, sent_at, project_id, created_at")
          .eq("studio_id", session.studioId)
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as unknown[], error: null }),
    supabase
      .from("email_queue")
      .select("id, subject, to_email, status, sent_at, created_at, related_entity_type")
      .eq("studio_id", session.studioId)
      .or(
        client.email
          ? `to_email.eq.${client.email},related_entity_id.eq.${params.id}`
          : `related_entity_id.eq.${params.id}`,
      )
      .order("created_at", { ascending: false })
      .limit(15),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const galleries = (galleriesRes.data ?? []) as any[]
  // Módulos SEPARADOS: Selección y Entrega Final son galerías distintas.
  const selectionGalleries = galleries.filter((g) => g.gallery_type !== "final_delivery")
  const deliveryGalleries = galleries.filter((g) => g.gallery_type === "final_delivery")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (invoicesRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments = (paymentsRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingsRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contracts = (contractsRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emails = (emailsRes.data ?? []) as any[]

  // Resolver thumbs de las galerías (necesita un round-trip extra para cover_asset)
  const coverAssetIds = galleries
    .map((g) => g.cover_asset_id as string | null)
    .filter(Boolean) as string[]
  const coverThumbs: Record<string, string | null> = {}
  if (coverAssetIds.length > 0) {
    const { data: coverRows } = await supabase
      .from("gallery_assets")
      .select("id, thumb_key")
      .in("id", coverAssetIds)
    for (const row of (coverRows ?? []) as Array<{ id: string; thumb_key: string | null }>) {
      coverThumbs[row.id] = getAssetThumbUrl(row.thumb_key)
    }
  }

  // Impresiones del cliente (estado por galería entregada de un plan con impresos).
  const [clientPrints, waPrintTemplate] = await Promise.all([
    listClientPrintOverview(session.studioId, params.id).catch(() => []),
    getPrintWaTemplate(session.studioId).catch(() => ""),
  ])

  // Métricas para resumen
  const totalInvoiced = invoices.reduce(
    (sum, inv) => sum + Number(inv.total ?? 0),
    0,
  )
  const totalPaid = payments
    .filter((p) => p.status === "completed" || p.status === "succeeded")
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0)
  const totalPending = totalInvoiced - totalPaid

  return (
    <>
      <ClientCreatedToast />
      <AppTopbar
        eyebrow="Clientes"
        title={client.name}
        description={`Cliente desde ${formatDateShort(new Date(client.created_at))}`}
        unreadNotifications={unread}
        actions={<ClientDetailActions client={client} />}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main content */}
          <div className="space-y-6 lg:col-span-2">
            {/* Proyectos */}
            <SectionCard
              icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />}
              title={`Proyectos (${projects.length})`}
              actionHref={`/projects/new?clientId=${client.id}`}
              actionLabel="+ Nuevo proyecto"
            >
              {projects.length === 0 ? (
                <Empty
                  icon={<FolderOpen className="h-8 w-8 text-muted-foreground" />}
                  msg="Sin proyectos todavía"
                  href={`/projects/new?clientId=${client.id}`}
                  cta="Crear primer proyecto →"
                />
              ) : (
                <div className="divide-y divide-border/40">
                  {projects.map((project) => {
                    const eventType = (project.event_type as string | null) ?? null
                    const eventDate = (project.event_date as string | null) ?? null
                    return (
                      <Link
                        key={String(project.id)}
                        href={`/projects/${project.id}`}
                        className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                          <FolderOpen className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                            {String(project.name)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(eventType && PROJECT_TYPE_LABELS[eventType]) ??
                              eventType ??
                              "Proyecto"}
                            {eventDate ? ` · ${formatDate(eventDate)}` : ""}
                          </p>
                        </div>
                        <StatusBadge status={String(project.status)} />
                      </Link>
                    )
                  })}
                </div>
              )}
            </SectionCard>

            {/* Sesiones finalizadas (archivadas) — separadas de las activas */}
            {finalizedProjects.length > 0 && (
              <SectionCard
                icon={<Archive className="h-4 w-4 text-muted-foreground" />}
                title={`Finalizadas (${finalizedProjects.length})`}
              >
                <div className="divide-y divide-border/40">
                  {finalizedProjects.map((project) => {
                    const eventType = (project.event_type as string | null) ?? null
                    const finalizedAt =
                      (project.files_purged_at as string | null) ??
                      (project.finalized_at as string | null)
                    const purged = !!(project.files_purged_at as string | null)
                    return (
                      <Link
                        key={String(project.id)}
                        href={`/projects/${project.id}`}
                        className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                          <Archive className="h-5 w-5 text-slate-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                            {String(project.name)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(eventType && PROJECT_TYPE_LABELS[eventType]) ??
                              eventType ??
                              "Sesión"}
                            {finalizedAt
                              ? ` · ${purged ? "Finalizado total" : "Finalizada"} ${formatDate(finalizedAt)}`
                              : ""}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-600/40 dark:bg-slate-800/40 dark:text-slate-300">
                          <Archive className="h-3 w-3" />
                          {purged ? "Finalizado total" : "Finalizada"}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </SectionCard>
            )}

            {/* Tareas del cliente */}
            <EntityTasks
              studioId={session.studioId}
              userId={session.userId}
              entityType="client"
              entityId={client.id as string}
              title="Tareas del cliente"
            />

            {/* Galería de SELECCIÓN — módulo separado */}
            <SectionCard
              icon={<Heart className="h-4 w-4 text-muted-foreground" />}
              title={`Selección (${selectionGalleries.length})`}
              actionHref={`/galleries/new?clientId=${client.id}`}
              actionLabel="+ Nueva selección"
            >
              {selectionGalleries.length === 0 ? (
                <Empty
                  icon={<Heart className="h-8 w-8 text-muted-foreground" />}
                  msg="Sin galería de selección"
                  href={`/galleries/new?clientId=${client.id}`}
                  cta="Crear galería de selección →"
                />
              ) : (
                <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
                  {selectionGalleries.map((g) => (
                    <ClientGalleryTile
                      key={g.id}
                      g={g}
                      cover={g.cover_asset_id ? coverThumbs[g.cover_asset_id] : null}
                      kind="selection"
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            {/* ENTREGA FINAL — módulo separado (su propia galería y enlace) */}
            <SectionCard
              icon={<Truck className="h-4 w-4 text-muted-foreground" />}
              title={`Entrega Final (${deliveryGalleries.length})`}
            >
              {deliveryGalleries.length === 0 ? (
                <Empty
                  icon={<Truck className="h-8 w-8 text-muted-foreground" />}
                  msg="Sin entrega final. Se crea desde la sesión."
                />
              ) : (
                <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
                  {deliveryGalleries.map((g) => (
                    <ClientGalleryTile
                      key={g.id}
                      g={g}
                      cover={g.cover_asset_id ? coverThumbs[g.cover_asset_id] : null}
                      kind="delivery"
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Contratos */}
            <SectionCard
              icon={<FileText className="h-4 w-4 text-muted-foreground" />}
              title={`Contratos (${contracts.length})`}
            >
              {contracts.length === 0 ? (
                <Empty
                  icon={<FileText className="h-8 w-8 text-muted-foreground" />}
                  msg="Sin contratos para este cliente"
                />
              ) : (
                <div className="divide-y divide-border/40">
                  {contracts.map((c) => (
                    <Link
                      key={c.id}
                      href={`/contracts/${c.id}`}
                      className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40"
                    >
                      <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground group-hover:text-primary">
                          {c.title}
                        </p>
                        <p className="text-[11.5px] text-muted-foreground">
                          {c.signed_at
                            ? `Firmado ${formatDateShort(new Date(c.signed_at))}`
                            : c.sent_at
                              ? `Enviado ${formatDateShort(new Date(c.sent_at))}`
                              : `Creado ${formatDateShort(new Date(c.created_at))}`}
                        </p>
                      </div>
                      <StatusBadge status={String(c.status)} />
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Facturas */}
            <SectionCard
              icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
              title={`Facturas (${invoices.length})`}
            >
              {invoices.length === 0 ? (
                <Empty
                  icon={<Receipt className="h-8 w-8 text-muted-foreground" />}
                  msg="Sin facturas registradas"
                />
              ) : (
                <div className="divide-y divide-border/40">
                  {invoices.map((inv) => (
                    <Link
                      key={inv.id}
                      href={`/invoices/${inv.id}`}
                      className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40"
                    >
                      <Receipt className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                          {inv.invoice_number ?? `Factura #${String(inv.id).slice(0, 6)}`}
                        </p>
                        <p className="text-[11.5px] text-muted-foreground">
                          {inv.due_date
                            ? `Vence ${formatDateShort(new Date(inv.due_date))}`
                            : formatDateShort(new Date(inv.created_at))}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(Number(inv.total ?? 0), inv.currency ?? "USD")}
                      </span>
                      <StatusBadge status={String(inv.status)} />
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Pagos */}
            <SectionCard
              icon={<CreditCard className="h-4 w-4 text-muted-foreground" />}
              title={`Pagos (${payments.length})`}
            >
              {payments.length === 0 ? (
                <Empty
                  icon={<CreditCard className="h-8 w-8 text-muted-foreground" />}
                  msg="Sin pagos registrados"
                />
              ) : (
                <div className="divide-y divide-border/40">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-4 px-5 py-3"
                    >
                      <CreditCard className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">
                          {formatCurrency(Number(p.amount ?? 0), p.currency ?? "USD")}
                          {p.method ? (
                            <span className="ml-2 text-[11px] uppercase text-muted-foreground">
                              {p.method}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[11.5px] text-muted-foreground">
                          {p.received_at
                            ? formatDateShort(new Date(p.received_at))
                            : formatDateShort(new Date(p.created_at))}
                        </p>
                      </div>
                      <StatusBadge status={String(p.status)} />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Entregas finales */}
            <DeliveriesPanel clientId={client.id as string} />

            {/* Impresiones — solo si el cliente tiene galerías con impresos */}
            {clientPrints.length > 0 && (
              <SectionCard
                icon={<Printer className="h-4 w-4 text-muted-foreground" />}
                title={`Impresiones (${clientPrints.length})`}
              >
                <div className="space-y-3 p-5">
                  {clientPrints.map((it) => (
                    <PrintRow
                      key={it.galleryId}
                      item={it}
                      waPrintTemplate={waPrintTemplate}
                    />
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Bookings/Reservas */}
            <SectionCard
              icon={<CalendarCheck className="h-4 w-4 text-muted-foreground" />}
              title={`Reservas (${bookings.length})`}
            >
              {bookings.length === 0 ? (
                <Empty
                  icon={<CalendarCheck className="h-8 w-8 text-muted-foreground" />}
                  msg="Sin reservas todavía"
                />
              ) : (
                <div className="divide-y divide-border/40">
                  {bookings.map((b) => (
                    <Link
                      key={b.id}
                      href={`/bookings/${b.id}`}
                      className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40"
                    >
                      <CalendarCheck className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground group-hover:text-primary">
                          {b.event_date
                            ? `Sesión ${formatDate(b.event_date as string)}`
                            : "Reserva"}
                        </p>
                        <p className="text-[11.5px] text-muted-foreground">
                          Creada {formatDateShort(new Date(b.created_at))}
                        </p>
                      </div>
                      <StatusBadge status={String(b.status)} />
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Historial de emails */}
            <SectionCard
              icon={<Send className="h-4 w-4 text-muted-foreground" />}
              title={`Correos enviados (${emails.length})`}
            >
              {emails.length === 0 ? (
                <Empty
                  icon={<Send className="h-8 w-8 text-muted-foreground" />}
                  msg="Aún no se enviaron correos a este cliente"
                />
              ) : (
                <div className="divide-y divide-border/40">
                  {emails.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-4 px-5 py-2.5"
                    >
                      <Mail className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{e.subject}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {e.to_email} ·{" "}
                          {e.sent_at
                            ? `enviado ${formatDateShort(new Date(e.sent_at))}`
                            : `pendiente desde ${formatDateShort(new Date(e.created_at))}`}
                        </p>
                      </div>
                      <StatusBadge status={String(e.status)} />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Notas internas */}
            <div className="sf-card p-5">
              <h2 className="mb-4 text-sm font-semibold text-foreground">
                Notas internas
              </h2>
              <NoteForm entityType="client" entityId={client.id} />

              <div className="mt-4 space-y-3">
                {notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin notas todavía.</p>
                ) : (
                  notes.map((note) => (
                    <div
                      key={String(note.id)}
                      className="border-l-2 border-border py-1 pl-3"
                    >
                      <p className="whitespace-pre-wrap text-sm text-foreground">
                        {String(note.content ?? "")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
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
            {/* Avatar + contact */}
            <div className="sf-card p-5">
              <div className="mb-5 flex flex-col items-center">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-purple-600 text-2xl font-bold text-white">
                  {client.name.charAt(0).toUpperCase()}
                </div>
                <h3 className="text-center text-base font-semibold text-foreground">
                  {client.name}
                </h3>
                {client.source && (
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {String(client.source).toLowerCase().replace(/_/g, " ")}
                  </p>
                )}
              </div>

              <dl className="space-y-3">
                {client.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <a
                      href={`mailto:${client.email}`}
                      className="truncate text-sm text-primary hover:underline"
                    >
                      {client.email}
                    </a>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <a
                      href={`tel:${client.phone}`}
                      className="text-sm text-foreground hover:text-primary"
                    >
                      {client.phone}
                    </a>
                  </div>
                )}
                {client.phone && formatDoPhone(client.phone) && (
                  <a
                    href={`https://wa.me/${formatDoPhone(client.phone)}?text=${encodeURIComponent(`Hola ${client.name ?? ""} 😊`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#25D366] px-3 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Chat directo por WhatsApp
                  </a>
                )}
                {(client.city || client.country) && (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span className="text-sm text-foreground">
                      {[client.city, client.country].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
                {client.instagram_handle && (
                  <div className="flex items-center gap-3">
                    <Instagram className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <a
                      href={`https://instagram.com/${client.instagram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      @{client.instagram_handle}
                    </a>
                  </div>
                )}
                {client.website_url && (
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <a
                      href={client.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 truncate text-sm text-primary hover:underline"
                    >
                      {String(client.website_url).replace(/^https?:\/\//, "")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </dl>
            </div>

            {/* Resumen financiero */}
            <div className="sf-card p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Resumen</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Proyectos</dt>
                  <dd className="font-medium text-foreground">{projects.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Galerías</dt>
                  <dd className="font-medium text-foreground">{galleries.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Facturado</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {formatCurrency(totalInvoiced, invoices[0]?.currency ?? "USD")}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Cobrado</dt>
                  <dd className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(totalPaid, invoices[0]?.currency ?? "USD")}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <dt className="font-medium text-muted-foreground">Pendiente</dt>
                  <dd
                    className={`font-mono tabular-nums font-semibold ${
                      totalPending > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-foreground"
                    }`}
                  >
                    {formatCurrency(totalPending, invoices[0]?.currency ?? "USD")}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <dt className="text-muted-foreground">Cliente desde</dt>
                  <dd className="text-foreground">
                    {formatDateShort(new Date(client.created_at))}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Portal del cliente */}
            <PortalAccessCard
              clientId={client.id as string}
              clientHasEmail={Boolean(client.email)}
              initialCode={(client as { access_code?: string | null }).access_code ?? null}
              initialSentAt={
                (client as { access_code_sent_at?: string | null }).access_code_sent_at ?? null
              }
              initialLastLogin={
                (client as { last_portal_login_at?: string | null }).last_portal_login_at ?? null
              }
            />

            {/* Notas del perfil */}
            {client.notes && (
              <div className="sf-card p-5">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  Notas del perfil
                </h2>
                <p className="whitespace-pre-wrap text-sm text-foreground/80">
                  {client.notes as string}
                </p>
              </div>
            )}

            {/* Danger zone */}
            <div className="sf-card border-red-100 p-5">
              <h2 className="mb-3 text-sm font-semibold text-danger">
                Zona de peligro
              </h2>
              <DeleteClientButton
                clientId={client.id as string}
                clientName={client.name as string}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── helpers UI locales ─────────────────────────────────────────────────────

/** Tarjeta de galería (selección o entrega) en el perfil del cliente. */
function ClientGalleryTile({
  g,
  cover,
  kind,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g: any
  cover: string | null | undefined
  kind: "selection" | "delivery"
}) {
  const delivered = kind === "delivery" && !!g.delivery_ready_at
  const badgeLabel =
    kind === "delivery" ? (delivered ? "Entrega enviada" : "Entrega") : "Selección"
  const badgeCls =
    kind === "delivery"
      ? "inline-flex rounded-full bg-brand-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-brand"
      : "inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground"
  return (
    <Link
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
            {kind === "delivery" ? <Truck className="h-6 w-6" /> : <Heart className="h-6 w-6" />}
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
          <span className={badgeCls}>{badgeLabel}</span>
          <span className="text-[11px] text-muted-foreground">
            {g.asset_count ?? 0} foto{(g.asset_count ?? 0) === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </Link>
  )
}

function SectionCard({
  icon,
  title,
  actionHref,
  actionLabel,
  children,
}: {
  icon: React.ReactNode
  title: string
  actionHref?: string
  actionLabel?: string
  children: React.ReactNode
}) {
  return (
    <CollapsibleCard title={title} icon={icon} flush>
      {actionHref && actionLabel ? (
        <div className="flex justify-end px-5 pt-3">
          <Link
            href={actionHref}
            className="text-xs font-medium text-primary hover:text-primary/80"
          >
            {actionLabel}
          </Link>
        </div>
      ) : null}
      {children}
    </CollapsibleCard>
  )
}

function Empty({
  icon,
  msg,
  href,
  cta,
}: {
  icon: React.ReactNode
  msg: string
  href?: string
  cta?: string
}) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto mb-2 inline-flex">{icon}</div>
      <p className="text-sm text-muted-foreground">{msg}</p>
      {href && cta ? (
        <Link
          href={href}
          className="mt-1 inline-block text-xs text-primary hover:underline"
        >
          {cta}
        </Link>
      ) : null}
    </div>
  )
}
