import 'server-only'

import { createSupabaseServiceClient } from '@/server/supabase/service'
import { untypedService } from '@/server/supabase/untyped'
import { throwServiceError } from '@/lib/utils/api-error'
import { logActivity } from '@/server/services/activity.service'
import { notify } from '@/server/services/notification.service'

/**
 * Cancelar una sesión.
 *
 * Antes "cancelar" era arrastrar la tarjeta a la columna Cancelado: solo
 * cambiaba la etiqueta y todo lo demás seguía corriendo — la factura quedaba
 * por cobrar, la fecha seguía ocupada en el calendario, el reloj de entrega
 * seguía contando y la sesión seguía saliendo en todas las listas.
 *
 * REGLA DE ORO: cancelar una sesión NO toca la ficha del cliente. El cliente
 * queda activo y le siguen llegando los correos de fidelidad (cumpleaños,
 * inactividad, campañas), porque el motor de fidelidad inscribe a todo cliente
 * que no esté en la papelera — no depende de tener sesiones vivas. Mandar el
 * cliente a la papelera es otra cosa, y esa sí lo saca de todo.
 */

/** Qué se hizo con el dinero ya cobrado. */
export type CancellationDeposit = 'kept' | 'refunded' | 'none'

export interface CancelProjectInput {
  studioId: string
  projectId: string
  actorId: string | null
  reason?: string | null
  /** 'kept' = me lo quedo; 'refunded' = se le devuelve. */
  deposit: CancellationDeposit
  /** Avisar al cliente por correo (por defecto sí). */
  notifyClient?: boolean
}

export interface CancelProjectResult {
  cancelled: boolean
  /** Cuánto había cobrado ya el estudio en esta sesión. */
  paidAmount: number
  /** Facturas que quedaron anuladas (las que no tenían dinero encima). */
  cancelledInvoices: number
  /** Se registró la devolución como cuenta por pagar en Finanzas. */
  refundRecorded: boolean
  /** Se le mandó el correo de aviso. */
  clientNotified: boolean
}

/** Lo que hay que saber de la sesión para poder cancelarla. */
async function loadProject(studioId: string, projectId: string) {
  const sb = untypedService()
  const { data } = await sb
    .from('projects')
    .select(
      'id, name, client_id, event_date, currency, cancelled_at, finalized_at, ' +
        'client:clients(name, email)',
    )
    .eq('id', projectId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .maybeSingle()
  return data as {
    id: string
    name: string | null
    client_id: string | null
    event_date: string | null
    currency: string | null
    cancelled_at: string | null
    finalized_at: string | null
    client: { name: string | null; email: string | null } | null
  } | null
}

export async function cancelProject(
  input: CancelProjectInput,
): Promise<CancelProjectResult> {
  const { studioId, projectId } = input
  const sb = untypedService()
  const svc = createSupabaseServiceClient()

  const project = await loadProject(studioId, projectId)
  if (!project) throwServiceError('PROJECT_NOT_FOUND', new Error(projectId))
  if (project.cancelled_at) {
    return {
      cancelled: false,
      paidAmount: 0,
      cancelledInvoices: 0,
      refundRecorded: false,
      clientNotified: false,
    }
  }

  const now = new Date().toISOString()

  // ── 1. Dinero: cuánto se cobró de verdad y qué facturas quedan anuladas ──
  // Solo se anulan las facturas SIN dinero encima. Una factura con pagos es
  // historia contable: se conserva tal cual, y si hay que devolver el dinero
  // eso se registra aparte como cuenta por pagar.
  const { data: invoicesRaw } = await sb
    .from('invoices')
    .select('id, status, total, amount_paid')
    .eq('studio_id', studioId)
    .eq('project_id', projectId)
    .is('deleted_at', null)
  const invoices = (invoicesRaw ?? []) as Array<{
    id: string
    status: string
    total: number | string
    amount_paid: number | string
  }>

  const paidAmount = invoices.reduce(
    (sum, i) => sum + Number(i.amount_paid ?? 0),
    0,
  )

  const anulables = invoices
    .filter((i) => Number(i.amount_paid ?? 0) === 0 && i.status !== 'cancelled')
    .map((i) => i.id)
  let cancelledInvoices = 0
  if (anulables.length > 0) {
    const { data: upd, error } = await sb
      .from('invoices')
      .update({ status: 'cancelled', updated_at: now })
      .in('id', anulables)
      .select('id')
    if (error) {
      console.error('[cancelProject] anular facturas falló', error)
    } else {
      cancelledInvoices = (upd ?? []).length
    }
  }

  // ── 2. Devolución (si el dueño eligió devolver) ──────────────────────────
  // Queda como cuenta POR PAGAR en Finanzas: el estudio le debe ese dinero al
  // cliente hasta que se lo entregue de verdad y salde la cuenta.
  let refundRecorded = false
  if (input.deposit === 'refunded' && paidAmount > 0) {
    try {
      const { recordClientRefundPayable } = await import(
        './finanzapp-bridge.service'
      )
      const r = await recordClientRefundPayable(studioId, {
        projectId,
        acreedor: project.client?.name || 'Cliente',
        monto: paidAmount,
        notas: `Devolución por cancelación — ${project.name ?? 'sesión'}`,
      })
      refundRecorded = r.ok
    } catch (err) {
      console.error('[cancelProject] registrar devolución falló', err)
    }
  }

  // ── 3. Se apaga el reloj de entrega ──────────────────────────────────────
  try {
    await sb
      .from('client_deliveries')
      .update({ deleted_at: now, updated_at: now })
      .eq('studio_id', studioId)
      .eq('project_id', projectId)
      .is('deleted_at', null)
  } catch (err) {
    console.error('[cancelProject] cerrar entrega falló', err)
  }

  // ── 4. La fecha se libera: fuera del calendario y del bloqueo de agenda ──
  try {
    const { deleteProjectEventSafe } = await import('./google-calendar.service')
    await deleteProjectEventSafe(studioId, projectId)
  } catch (err) {
    console.error('[cancelProject] borrar evento de calendario falló', err)
  }

  // ── 5. La solicitud de reserva original también queda cancelada ──────────
  const { data: reqRow } = await sb
    .from('booking_requests')
    .select('id, status')
    .eq('studio_id', studioId)
    .eq('project_id', projectId)
    .maybeSingle()
  const bookingRequestId = (reqRow as { id: string } | null)?.id ?? null
  if (bookingRequestId) {
    try {
      const { removeBlockForBooking } = await import('./availability.service')
      await removeBlockForBooking({ studioId, bookingRequestId })
    } catch (err) {
      console.error('[cancelProject] liberar la fecha falló', err)
    }
    try {
      await sb
        .from('booking_requests')
        .update({
          status: 'cancelled',
          cancelled_at: now,
          cancelled_by: input.actorId,
          cancellation_reason: input.reason ?? null,
          updated_at: now,
        })
        .eq('id', bookingRequestId)
    } catch (err) {
      console.error('[cancelProject] cancelar la solicitud falló', err)
    }
  }

  // ── 6. Las tareas pendientes de esta sesión dejan de molestar ────────────
  try {
    await sb
      .from('tasks')
      .update({ deleted_at: now, updated_at: now })
      .eq('studio_id', studioId)
      .eq('entity_type', 'project')
      .eq('entity_id', projectId)
      .is('completed_at', null)
      .is('deleted_at', null)
  } catch (err) {
    console.error('[cancelProject] cerrar tareas falló', err)
  }

  // ── 7. La sesión queda cancelada y archivada de las vistas activas ───────
  // `finalized_at` es la misma bandera de archivo que usa "Finalizar": ya está
  // filtrada en tablero, pipeline, tareas, galerías, dashboard y entregas, así
  // que la sesión desaparece de todo sin tocar esas consultas otra vez.
  const { data: updatedProject, error: projErr } = await sb
    .from('projects')
    .update({
      status: 'Cancelado',
      cancelled_at: now,
      cancellation_reason: input.reason ?? null,
      cancellation_deposit: paidAmount > 0 ? input.deposit : 'none',
      finalized_at: now,
      updated_at: now,
    })
    .eq('id', projectId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .select('id')
  if (projErr) throwServiceError('PROJECT_CANCEL_FAILED', projErr)
  if (!updatedProject || updatedProject.length === 0) {
    throwServiceError(
      'PROJECT_CANCEL_FAILED',
      new Error(`la cancelación no afectó ninguna fila (${projectId})`),
    )
  }

  // ── 8. Aviso al cliente ─────────────────────────────────────────────────
  let clientNotified = false
  if (input.notifyClient !== false && project.client?.email) {
    try {
      const { renderSessionCancelledForClient, enqueueEmail } = await import(
        './email.service'
      )
      const { getEmailBranding } = await import('./email-template.service')
      const { data: studio } = await svc
        .from('studios')
        .select('name, email, primary_color')
        .eq('id', studioId)
        .maybeSingle()
      const st = studio as {
        name: string
        email: string | null
        primary_color: string | null
      } | null
      const { subject, html } = renderSessionCancelledForClient({
        studioName: st?.name ?? 'Estudio',
        primaryColor: st?.primary_color ?? '#111827',
        branding: await getEmailBranding(studioId),
        clientName: project.client.name ?? 'Hola',
        projectName: project.name ?? 'tu sesión',
        eventDate: project.event_date,
        reason: input.reason ?? null,
        refunded: refundRecorded,
      })
      await enqueueEmail({
        studioId,
        toEmail: project.client.email,
        toName: project.client.name ?? undefined,
        subject,
        bodyHtml: html,
        replyTo: st?.email ?? null,
        templateSlug: 'session_cancelled_for_client',
        relatedEntityType: 'project',
        relatedEntityId: projectId,
      })
      clientNotified = true
    } catch (err) {
      console.error('[cancelProject] avisar al cliente falló', err)
    }
  }

  // ── 9. Historial + aviso interno ────────────────────────────────────────
  try {
    await logActivity({
      studioId,
      actorId: input.actorId,
      actorType: input.actorId ? 'user' : 'system',
      entityType: 'project',
      entityId: projectId,
      action: 'project.cancelled',
      description: input.reason
        ? `Sesión cancelada: ${input.reason}`
        : 'Sesión cancelada',
      metadata: {
        paid_amount: paidAmount,
        deposit: paidAmount > 0 ? input.deposit : 'none',
        cancelled_invoices: cancelledInvoices,
        refund_recorded: refundRecorded,
        client_notified: clientNotified,
        // Constancia explícita: el cliente NUNCA se toca al cancelar.
        client_kept_active: true,
      },
      afterState: { status: 'Cancelado', cancelled_at: now },
    })
  } catch {
    /* el historial no bloquea */
  }
  try {
    await notify({
      studioId,
      type: 'session_cancelled',
      title: 'Sesión cancelada',
      body: `${project.name ?? 'Sesión'} — ${project.client?.name ?? 'cliente'}`,
      relatedEntityType: 'project',
      relatedEntityId: projectId,
      actionUrl: `/projects/${projectId}`,
    })
  } catch {
    /* el aviso no bloquea */
  }

  return {
    cancelled: true,
    paidAmount,
    cancelledInvoices,
    refundRecorded,
    clientNotified,
  }
}

/**
 * Deshacer la cancelación: la sesión vuelve al tablero.
 *
 * Lo que ya se movió de dinero NO se revierte solo (facturas anuladas y
 * devoluciones registradas se ajustan a mano); esto devuelve la sesión a la
 * vida para poder retomarla.
 */
export async function reopenCancelledProject(
  studioId: string,
  projectId: string,
): Promise<void> {
  const sb = untypedService()
  const now = new Date().toISOString()
  const { error } = await sb
    .from('projects')
    .update({
      cancelled_at: null,
      cancellation_reason: null,
      cancellation_deposit: null,
      finalized_at: null,
      status: 'Pendiente de pago',
      updated_at: now,
    })
    .eq('id', projectId)
    .eq('studio_id', studioId)
    .not('cancelled_at', 'is', null)
  if (error) throwServiceError('PROJECT_REOPEN_FAILED', error)

  try {
    const { recomputeProjectDelivery } = await import('./delivery.service')
    await recomputeProjectDelivery(studioId, projectId)
  } catch (err) {
    console.error('[reopenCancelledProject] recalcular entrega falló', err)
  }
  try {
    await logActivity({
      studioId,
      actorId: null,
      actorType: 'user',
      entityType: 'project',
      entityId: projectId,
      action: 'project.cancellation_undone',
      description: 'Cancelación deshecha — la sesión volvió al tablero',
    })
  } catch {
    /* el historial no bloquea */
  }
}
