import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { revalidatePath } from "next/cache"
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Users,
  FileText,
  CheckCircle2,
  XCircle,
  Ban,
  RotateCcw,
} from "lucide-react"
import { requireStudioAuth, requireRole } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import {
  getBookingRequestById,
  approveBookingRequest,
  rejectBookingRequest,
  cancelBookingRequest,
} from "@/server/services/booking-request.service"
import { getEntityActivity } from "@/server/services/activity.service"
import { listFormResponsesForBooking } from "@/server/services/form.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getClientShareLinks } from "@/server/services/client-portal.service"
import { StatusBadge } from "@/components/shared/status-badge"
import { AppTopbar } from "@/components/layout/app-topbar"
import { ActivityTimeline } from "@/components/shared/activity-timeline"
import { FormResponsesPanel } from "@/components/admin/form-responses-panel"
import { ShareWithClientPanel } from "@/components/bookings/share-with-client-panel"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"
import type { Database } from "@/types/supabase"

export const dynamic = "force-dynamic"

type BookingStatus = Database["public"]["Enums"]["booking_request_status"]

// Tipo estructural de la fila + join (evita `any`)
type BookingDetail = {
  id: string
  status: BookingStatus
  client_name: string
  client_email: string
  client_phone: string | null
  client_whatsapp: string | null
  client_id: string | null
  project_id: string | null
  event_type: string | null
  event_date: string
  event_time: string | null
  event_end_time: string | null
  event_location: string | null
  guest_count: number | null
  additional_notes: string | null
  rejection_reason: string | null
  cancellation_reason: string | null
  created_at: string
  approved_at: string | null
  rejected_at: string | null
  cancelled_at: string | null
  package: {
    id: string
    name: string
    slug: string
    price: number | string
    currency: string | null
    duration_hours: number | null
    edited_photos: number | null
    includes: string[] | null
    event_type: string | null
  } | null
  pricing_snapshot: Record<string, unknown>
  package_snapshot: Record<string, unknown>
}

// Server Actions
async function approveAction(formData: FormData) {
  "use server"
  const session = await requireRole("staff")
  const id = String(formData.get("id") ?? "")
  if (!id) redirect("/bookings")
  try {
    await approveBookingRequest({
      studioId: session.studioId,
      requestId: id,
      actorId: session.userId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error_desconocido"
    if (msg.includes("fecha del evento ya pasó")) {
      redirect(`/bookings/${id}?error=event_past`)
    }
    if (msg.includes("Transición ilegal") || msg.includes("conflicto")) {
      redirect(`/bookings/${id}?error=conflict`)
    }
    throw err
  }
  revalidatePath(`/bookings/${id}`)
  revalidatePath("/bookings")
}

async function rejectAction(formData: FormData) {
  "use server"
  const session = await requireRole("staff")
  const id = String(formData.get("id") ?? "")
  const reason = String(formData.get("reason") ?? "").trim() || undefined
  if (!id) redirect("/bookings")
  try {
    await rejectBookingRequest({
      studioId: session.studioId,
      requestId: id,
      actorId: session.userId,
      reason,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error_desconocido"
    if (msg.includes("Transición ilegal") || msg.includes("conflicto")) {
      redirect(`/bookings/${id}?error=conflict`)
    }
    throw err
  }
  revalidatePath(`/bookings/${id}`)
  revalidatePath("/bookings")
}

async function cancelAction(formData: FormData) {
  "use server"
  const session = await requireRole("staff")
  const id = String(formData.get("id") ?? "")
  const fromStatus = String(formData.get("fromStatus") ?? "") as BookingStatus
  const reason = String(formData.get("reason") ?? "").trim() || undefined
  if (!id || !fromStatus) redirect("/bookings")
  try {
    await cancelBookingRequest({
      studioId: session.studioId,
      requestId: id,
      actorId: session.userId,
      fromStatus,
      reason,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error_desconocido"
    if (msg.includes("Transición ilegal") || msg.includes("conflicto")) {
      redirect(`/bookings/${id}?error=conflict`)
    }
    throw err
  }
  revalidatePath(`/bookings/${id}`)
  revalidatePath("/bookings")
}

// Reset total para pruebas: borra cliente/proyecto/contrato/form/factura/pagos/
// notificaciones/historial generados por la solicitud y la deja en pending_review.
async function resetTestAction(formData: FormData) {
  "use server"
  const session = await requireRole("admin")
  const id = String(formData.get("id") ?? "")
  if (!id) redirect("/bookings")

  // Validar que la solicitud pertenece al studio del usuario antes de resetear.
  const booking = await getBookingRequestById(session.studioId, id).catch(() => null)
  if (!booking) redirect("/bookings")

  const supabase = createSupabaseServerClient()
  // RPC SECURITY DEFINER (no está en los tipos generados → cast).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc(
    "reset_booking_request_for_testing",
    { p_booking_request_id: id },
  )
  if (error) {
    console.error("[resetTestAction] reset falló:", error.message)
    redirect(`/bookings/${id}?error=reset_failed`)
  }
  revalidatePath(`/bookings/${id}`)
  revalidatePath("/bookings")
  redirect(`/bookings/${id}?reset=1`)
}

const ACTION_ERROR_MESSAGES: Record<string, string> = {
  event_past:
    "No se puede aprobar: la fecha del evento ya pasó. Cancela o rechaza la solicitud.",
  conflict:
    "Otro operador ya actualizó esta solicitud. Recarga para ver el estado actual.",
  reset_failed:
    "No se pudo reiniciar la solicitud. Revisa los logs e inténtalo de nuevo.",
}

export default async function BookingRequestDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { error?: string; reset?: string }
}) {
  const session = await requireStudioAuth()
  const raw = await getBookingRequestById(session.studioId, params.id)
  if (!raw) notFound()

  const req = raw as unknown as BookingDetail
  const [activity, formResponses, unread] = await Promise.all([
    getEntityActivity(session.studioId, "booking_request", req.id, 50),
    listFormResponsesForBooking({
      studioId: session.studioId,
      bookingRequestId: req.id,
    }),
    countUnreadNotifications(session.studioId),
  ])

  // Links compartibles para el cliente (solo si el booking ya generó cliente,
  // i.e. fue aprobado). Fallback cuando el email de confirmación no llega.
  const shareLinks = req.client_id
    ? await getClientShareLinks(session.studioId, req.id).catch(() => null)
    : null
  const publicBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""
  const pkg = req.package
  const currency = pkg?.currency ?? "DOP"
  const price = pkg ? Number(pkg.price) : 0

  // Info del pricing_snapshot (inmutable en el momento de la solicitud)
  const snapshot = req.pricing_snapshot as {
    price?: number
    currency?: string
    deposit_percent?: number
    deposit_amount?: number
  }
  const snapshotPrice = Number(snapshot.price ?? price)
  const snapshotCurrency = snapshot.currency ?? currency
  const priceChanged =
    pkg && Number(pkg.price) !== snapshotPrice ? true : false

  const actionError =
    searchParams?.error && ACTION_ERROR_MESSAGES[searchParams.error]
      ? ACTION_ERROR_MESSAGES[searchParams.error]
      : null
  const resetDone = searchParams?.reset === "1"

  const canApproveOrReject = req.status === "pending_review"
  const canCancel = [
    "approved",
    "awaiting_payment",
    "confirmed",
    "scheduled",
  ].includes(req.status)

  return (
    <>
      <AppTopbar
        eyebrow="Solicitudes de booking"
        title={req.client_name}
        description={`Solicitud #${req.id.slice(0, 8).toUpperCase()}`}
        unreadNotifications={unread}
        actions={<StatusBadge status={req.status} />}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8 max-w-5xl">
        <Link
          href="/bookings"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Volver a solicitudes
        </Link>

        {actionError && (
          <div
            role="alert"
            className="bg-danger/10 border border-red-200 rounded-xl px-4 py-3 text-sm text-danger flex items-start gap-2"
          >
            <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {resetDone && (
          <div
            role="status"
            className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 flex items-start gap-2"
          >
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              Solicitud reiniciada desde cero. Cliente, proyecto, contrato,
              formulario, factura, pagos, notificaciones e historial fueron
              eliminados. Ya puedes aprobarla de nuevo para volver a probar.
            </span>
          </div>
        )}

        {/* Compartir con el cliente — visible cuando el booking fue aprobado.
            Fallback al email de confirmación (útil sin SMTP configurado). */}
        {shareLinks && (
          <ShareWithClientPanel
            confirmationUrl={shareLinks.confirmationUrl}
            portalUrl={shareLinks.portalUrl}
            accessCode={shareLinks.accessCode}
            clientName={shareLinks.clientName}
            clientWhatsapp={shareLinks.clientWhatsapp}
            contractSignUrl={shareLinks.contractSignUrl}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Contacto */}
            <Section title="Contacto">
              <Row icon={<Mail className="h-5 w-5" />} label="Email">
                <a
                  href={`mailto:${req.client_email}`}
                  className="text-primary hover:underline"
                >
                  {req.client_email}
                </a>
              </Row>
              {req.client_phone && (
                <Row icon={<Phone className="h-5 w-5" />} label="Teléfono">
                  <a
                    href={`tel:${req.client_phone}`}
                    className="text-foreground hover:underline"
                  >
                    {req.client_phone}
                  </a>
                </Row>
              )}
              {req.client_whatsapp && (
                <Row icon={<Phone className="h-5 w-5" />} label="WhatsApp">
                  <a
                    href={`https://wa.me/${req.client_whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 hover:underline"
                  >
                    {req.client_whatsapp}
                  </a>
                </Row>
              )}
            </Section>

            {/* Evento */}
            <Section title="Evento">
              <Row icon={<Calendar className="h-5 w-5" />} label="Fecha">
                {formatDateShort(req.event_date as string)}
                {req.event_time && (
                  <span className="text-xs text-muted-foreground ml-2">
                    · {req.event_time.slice(0, 5)}
                  </span>
                )}
              </Row>
              {req.event_type && (
                <Row icon={<FileText className="h-5 w-5" />} label="Tipo de evento">
                  {req.event_type}
                </Row>
              )}
              {req.event_location && (
                <Row icon={<MapPin className="h-5 w-5" />} label="Ubicación">
                  {req.event_location}
                </Row>
              )}
              {req.guest_count != null && (
                <Row icon={<Users className="h-5 w-5" />} label="Invitados">
                  {req.guest_count}
                </Row>
              )}
              {req.additional_notes && (
                <div className="pt-3 mt-3 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Notas
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                    {req.additional_notes}
                  </p>
                </div>
              )}
            </Section>

            {/* Motivos */}
            {req.status === "rejected" && req.rejection_reason && (
              <Section title="Motivo del rechazo" tone="red">
                <p className="text-sm text-danger whitespace-pre-line">
                  {req.rejection_reason}
                </p>
                {req.rejected_at && (
                  <p className="text-xs text-red-400 mt-2">
                    {formatDateShort(new Date(req.rejected_at))}
                  </p>
                )}
              </Section>
            )}
            {req.status === "cancelled" && req.cancellation_reason && (
              <Section title="Motivo de cancelación" tone="gray">
                <p className="text-sm text-foreground whitespace-pre-line">
                  {req.cancellation_reason}
                </p>
              </Section>
            )}

            {/* Acciones */}
            {canApproveOrReject && (
              <div className="sf-card bg-amber-50 border-amber-200 p-5">
                <p className="text-sm font-semibold text-amber-900 mb-1">
                  Revisar esta solicitud
                </p>
                <p className="text-xs text-amber-800 mb-4">
                  Aprobar creará el proyecto cuando el cliente confirme el pago
                  de la reserva. Rechazar notificará al cliente con tu motivo.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <form action={approveAction}>
                    <input type="hidden" name="id" value={req.id} />
                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Aprobar
                    </button>
                  </form>
                  <details className="relative">
                    <summary className="list-none cursor-pointer">
                      <div className="w-full flex items-center justify-center gap-2 py-2.5 bg-card border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors">
                        <XCircle className="h-4 w-4" />
                        Rechazar
                      </div>
                    </summary>
                    <form
                      action={rejectAction}
                      className="mt-2 bg-card rounded-lg border border-border p-3 space-y-2"
                    >
                      <input type="hidden" name="id" value={req.id} />
                      <textarea
                        name="reason"
                        rows={3}
                        maxLength={500}
                        placeholder="Motivo (opcional pero recomendado)"
                        className="w-full px-3 py-2 text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <button
                        type="submit"
                        className="w-full py-2 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 transition-colors"
                      >
                        Confirmar rechazo
                      </button>
                    </form>
                  </details>
                </div>
              </div>
            )}

            {/* Formularios del cliente */}
            <FormResponsesPanel
              responses={formResponses}
              publicBaseUrl={publicBaseUrl}
              bookingId={req.id}
            />

            {/* Timeline de actividad */}
            <section className="sf-card overflow-hidden !p-0">
              <h2 className="text-sm font-semibold text-foreground px-5 pt-5">
                Historial
              </h2>
              <ActivityTimeline rows={activity} />
            </section>

            {canCancel && (
              <details className="sf-card p-5">
                <summary className="list-none cursor-pointer flex items-center gap-2 text-sm font-medium text-foreground">
                  <Ban className="h-4 w-4" />
                  Cancelar esta reserva
                </summary>
                <form action={cancelAction} className="mt-4 space-y-3">
                  <input type="hidden" name="id" value={req.id} />
                  <input
                    type="hidden"
                    name="fromStatus"
                    value={req.status}
                  />
                  <textarea
                    name="reason"
                    rows={3}
                    maxLength={500}
                    placeholder="Motivo de la cancelación"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
                  >
                    Confirmar cancelación
                  </button>
                </form>
              </details>
            )}

            {/* Zona de pruebas — reinicio total de la solicitud */}
            <details className="sf-card border-dashed border-amber-300 bg-amber-50/40 p-5">
              <summary className="list-none cursor-pointer flex items-center gap-2 text-sm font-medium text-amber-900">
                <RotateCcw className="h-4 w-4" />
                Reiniciar para pruebas (volver a cero)
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs text-amber-800 leading-relaxed">
                  Borra por completo el <strong>cliente, proyecto, contrato,
                  formulario, factura, pagos, eventos de calendario,
                  notificaciones e historial</strong> generados por esta
                  solicitud y la deja en <strong>&ldquo;pendiente de
                  revisión&rdquo;</strong> para volver a probar el flujo desde
                  cero. Esta acción no se puede deshacer.
                </p>
                <form action={resetTestAction}>
                  <input type="hidden" name="id" value={req.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reiniciar desde cero
                  </button>
                </form>
              </div>
            </details>
          </div>

          {/* Sidebar: paquete */}
          <aside>
            <div className="sf-card p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                Paquete solicitado
              </p>
              {pkg ? (
                <>
                  <p className="font-semibold text-foreground mb-1">{pkg.name}</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    {pkg.event_type ?? "Sesión"}
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(snapshotPrice, snapshotCurrency)}
                  </p>
                  {priceChanged && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      El precio actual del paquete es{" "}
                      {formatCurrency(Number(pkg.price), currency)}.
                    </p>
                  )}
                  {snapshot.deposit_amount ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      Reserva ({snapshot.deposit_percent ?? 0}%):{" "}
                      {formatCurrency(
                        Number(snapshot.deposit_amount),
                        snapshotCurrency,
                      )}
                    </p>
                  ) : null}

                  <div className="mt-4 pt-4 border-t border-border/60 space-y-2 text-xs">
                    {pkg.duration_hours ? (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Duración</span>
                        <span className="font-medium text-foreground">
                          {pkg.duration_hours} h
                        </span>
                      </div>
                    ) : null}
                    {pkg.edited_photos ? (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Fotos editadas</span>
                        <span className="font-medium text-foreground">
                          {pkg.edited_photos}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <Link
                    href={`/settings/packages#pkg-${pkg.id}`}
                    className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Ver paquete en /settings →
                  </Link>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  El paquete referenciado ya no existe.
                </p>
              )}
            </div>

            <div className="mt-4 sf-card p-5 text-xs text-muted-foreground space-y-1">
              <p>
                Recibida:{" "}
                <span className="text-foreground font-medium">
                  {formatDateShort(new Date(req.created_at))}
                </span>
              </p>
              {req.approved_at && (
                <p>
                  Aprobada:{" "}
                  <span className="text-foreground font-medium">
                    {formatDateShort(new Date(req.approved_at))}
                  </span>
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}

function Section({
  title,
  children,
  tone = "white",
}: {
  title: string
  children: React.ReactNode
  tone?: "white" | "red" | "gray"
}) {
  const styles = {
    white: "sf-card",
    red: "sf-card bg-danger/10 border-red-200",
    gray: "sf-card bg-muted/30",
  }[tone]
  return (
    <section className={`${styles} p-5`}>
      <h2 className="text-sm font-semibold text-foreground mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <div className="text-foreground">{children}</div>
      </div>
    </div>
  )
}
