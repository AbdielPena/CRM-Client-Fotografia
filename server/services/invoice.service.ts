import 'server-only'

import { invoicesRepo } from '@/server/repositories'
import { createSupabaseServerClient } from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'
import type { CreateInvoiceInput } from '@/lib/validations/invoice.schema'
import { throwServiceError } from '@/lib/utils/api-error'
import { logActivity } from './activity.service'

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function calculateTotals(
  items: { quantity: number; unitPrice: number; taxRate: number }[],
  discount = 0,
) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const discountAmount = (subtotal * discount) / 100
  const tax = items.reduce(
    (s, i) => s + i.quantity * i.unitPrice * ((i.taxRate ?? 0) / 100),
    0,
  )
  const total = subtotal - discountAmount + tax
  return { subtotal, discountAmount, tax, total }
}

// ----------------------------------------------------------------------------
// Listado + detalle
// ----------------------------------------------------------------------------

export async function getInvoices(
  studioId: string,
  opts: { status?: string; search?: string; page?: number; pageSize?: number } = {},
) {
  const { status, search, page = 1, pageSize = 50 } = opts
  const supabase = createSupabaseServerClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('invoices')
    .select(
      `
        *,
        client:clients(id, name),
        project:projects(id, name)
      `,
      { count: 'exact' },
    )
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (status) query = query.eq('status', status as any)
  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    // Solo buscamos por número de factura — para buscar por cliente/proyecto
    // se haría con una vista materializada o un RPC dedicado.
    query = query.ilike('invoice_number', term)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("INVOICE_LIST_FAILED", error, { studioId })

  const total = count ?? 0
  return {
    items: data ?? [],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  }
}

export async function getInvoiceById(studioId: string, invoiceId: string) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('invoices')
    .select(
      `
        *,
        client:clients(*),
        project:projects(id, name, event_type),
        items:invoice_items(*),
        payments(*)
      `,
    )
    .eq('id', invoiceId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throwServiceError("INVOICE_GET_FAILED", error, { studioId, invoiceId })
  if (!data) return null

  // Ordenar items por sort_order y payments por received_at desc en JS
  return {
    ...data,
    items: [...(data.items ?? [])].sort(
      (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order,
    ),
    payments: [...(data.payments ?? [])].sort(
      (a: { received_at: string | null }, b: { received_at: string | null }) => {
        const da = a.received_at ? new Date(a.received_at).getTime() : 0
        const db = b.received_at ? new Date(b.received_at).getTime() : 0
        return db - da
      },
    ),
  }
}

// ----------------------------------------------------------------------------
// Crear
// ----------------------------------------------------------------------------

/**
 * Valida que el cliente exista, pertenezca al studio y NO esté en trash.
 * Lanza error con código semántico para que el caller lo traduzca.
 */
async function assertClientActive(
  studioId: string,
  clientId: string,
  context: string,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('clients')
    .select('id, deleted_at')
    .eq('id', clientId)
    .eq('studio_id', studioId)
    .maybeSingle()
  if (error) throwServiceError("CLIENT_LOOKUP_FAILED", error, { context, clientId, studioId })
  if (!data) throw new Error('CLIENT_NOT_FOUND')
  if (data.deleted_at) throw new Error('CLIENT_TRASHED')
}

export async function createInvoice(
  studioId: string,
  actorId: string,
  data: CreateInvoiceInput,
) {
  // Integridad: cliente debe existir, ser del studio y NO estar en trash
  if (!data.clientId) throw new Error('CLIENT_REQUIRED')
  await assertClientActive(studioId, data.clientId, 'createInvoice')

  const invoiceNumber = await invoicesRepo.nextInvoiceNumber(studioId)
  const sequenceNumber = parseInt(
    invoiceNumber.replace(/^.*-/, '').replace(/^0+/, '') || '0',
    10,
  )
  const { subtotal, discountAmount, tax, total } = calculateTotals(
    data.items,
    data.discount,
  )
  const currency = (data.currency || 'DOP').toUpperCase()

  const invoice = await invoicesRepo.create({
    studio_id: studioId,
    project_id: data.projectId,
    client_id: data.clientId,
    invoice_number: invoiceNumber,
    sequence_number: sequenceNumber,
    kind: 'full',
    subtotal,
    tax_rate: 0,
    tax_amount: tax,
    discount_amount: discountAmount,
    total,
    amount_paid: 0,
    currency,
    status: 'draft',
    due_date: data.dueDate || null,
    notes: data.notes || null,
    created_by: actorId || null,
  })

  await invoicesRepo.addItems(
    data.items.map((item, idx) => ({
      invoice_id: invoice.id,
      studio_id: studioId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      amount: item.quantity * item.unitPrice,
      sort_order: idx,
    })),
  )

  await logActivity({
    studioId,
    actorId,
    entityType: 'invoice',
    entityId: invoice.id,
    action: 'invoice.created',
    metadata: { invoice_number: invoiceNumber, total },
  })

  return invoice
}

// ----------------------------------------------------------------------------
// Editar
// ----------------------------------------------------------------------------

export interface UpdateInvoiceData {
  items: { description: string; quantity: number; unitPrice: number; taxRate: number }[]
  discount?: number
  depositPercent?: number
  dueDate?: string | null
  notes?: string | null
  currency?: string
  title?: string | null
}

/**
 * Edita una factura existente: reemplaza los ítems, recalcula totales y
 * mantiene el plan de cuotas (depósito 50% → installment_total=2). No toca
 * `amount_paid` (eso lo maneja el trigger de pagos), pero sí recalcula el
 * `status` y `balance_due` por si el total cambió respecto a lo ya pagado.
 * Al final notifica al cliente del cambio (best-effort).
 */
export async function updateInvoice(
  studioId: string,
  actorId: string,
  invoiceId: string,
  data: UpdateInvoiceData,
) {
  const existing = await invoicesRepo.findById(invoiceId)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('INVOICE_NOT_FOUND')
  }
  if (existing.status === 'cancelled') {
    throw new Error('INVOICE_CANCELLED')
  }

  const { subtotal, discountAmount, tax, total } = calculateTotals(
    data.items,
    data.discount ?? 0,
  )
  const currency = (data.currency || existing.currency || 'DOP').toUpperCase()
  const amountPaid = Number(existing.amount_paid ?? 0)

  // Depósito → define si la factura se divide en 2 cuotas (reserva + balance)
  const depositPercent = Number(data.depositPercent ?? 0)
  const installmentTotal =
    depositPercent > 0 && depositPercent < 100
      ? 2
      : (existing.installment_total ?? 1)

  // Recalcular status respecto a lo ya pagado
  let status = existing.status as string
  if (total > 0 && amountPaid >= total) status = 'paid'
  else if (amountPaid > 0) status = 'partially_paid'
  else if (status === 'paid' || status === 'partially_paid') status = 'sent'

  // NOTA: `balance_due` es una columna GENERATED ALWAYS (total - amount_paid),
  // no se puede escribir — la BD la recalcula sola al cambiar el total.
  const prevMeta =
    (existing.metadata && typeof existing.metadata === 'object'
      ? (existing.metadata as Record<string, unknown>)
      : {}) ?? {}

  await invoicesRepo.update(invoiceId, {
    subtotal,
    tax_rate: 0,
    tax_amount: tax,
    discount_amount: discountAmount,
    total,
    currency,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: status as any,
    installment_total: installmentTotal,
    due_date: data.dueDate || null,
    notes: data.notes ?? null,
    title: data.title ?? existing.title ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: { ...prevMeta, deposit_percent: depositPercent || null } as any,
    updated_at: new Date().toISOString(),
  })

  // Reemplazar ítems: borrar los actuales e insertar los nuevos
  const supabase = createSupabaseServerClient()
  const { error: delErr } = await supabase
    .from('invoice_items')
    .delete()
    .eq('invoice_id', invoiceId)
    .eq('studio_id', studioId)
  if (delErr) throwServiceError('INVOICE_ITEMS_DELETE_FAILED', delErr, { studioId, invoiceId })

  await invoicesRepo.addItems(
    data.items.map((item, idx) => ({
      invoice_id: invoiceId,
      studio_id: studioId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      amount: item.quantity * item.unitPrice,
      sort_order: idx,
    })),
  )

  await logActivity({
    studioId,
    actorId,
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'invoice.updated',
    metadata: { total, currency, deposit_percent: depositPercent },
  })

  // Notificar al cliente del cambio (best-effort, no bloquea)
  await notifyClientInvoiceChanged(studioId, invoiceId, { changeKind: 'edit' })

  return { id: invoiceId, total, status, projectId: existing.project_id ?? null }
}

/**
 * Envía al cliente un email con el estado actualizado de la factura.
 * `changeKind: 'payment'` tras registrar un pago; `'edit'` tras editar la
 * factura. Best-effort: cualquier fallo se loguea pero no propaga.
 */
async function notifyClientInvoiceChanged(
  studioId: string,
  invoiceId: string,
  opts: { changeKind: 'payment' | 'edit'; paymentAmount?: number },
): Promise<void> {
  try {
    const supabase = createSupabaseServiceClient()
    const { data: inv } = await supabase
      .from('invoices')
      .select(
        'invoice_number, total, amount_paid, currency, status, client_id, project_id',
      )
      .eq('id', invoiceId)
      .eq('studio_id', studioId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoice = inv as any
    if (!invoice) return

    const [cliRes, stRes, prRes] = await Promise.all([
      supabase.from('clients').select('name, email').eq('id', invoice.client_id).maybeSingle(),
      supabase.from('studios').select('name, primary_color').eq('id', studioId).maybeSingle(),
      invoice.project_id
        ? supabase.from('projects').select('name').eq('id', invoice.project_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = cliRes.data as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studio = stRes.data as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project = prRes.data as any
    if (!client?.email) return

    const currency = invoice.currency ?? 'DOP'
    const total = Number(invoice.total ?? 0)
    const paid = Number(invoice.amount_paid ?? 0)
    const balance = Math.max(total - paid, 0)
    const fmt = (n: number) =>
      `${currency} ${new Intl.NumberFormat('es-DO', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n)}`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const { renderInvoiceUpdate, enqueueEmail } = await import('./email.service')
    const email = renderInvoiceUpdate({
      studioName: studio?.name ?? 'Studio',
      primaryColor: studio?.primary_color ?? '#7c3aed',
      clientName: String(client.name ?? 'Cliente').split(' ')[0],
      projectName: project?.name ?? null,
      invoiceNumber: invoice.invoice_number,
      changeKind: opts.changeKind,
      totalFormatted: fmt(total),
      paidFormatted: fmt(paid),
      balanceFormatted: fmt(balance),
      paymentAmountFormatted: opts.paymentAmount ? fmt(opts.paymentAmount) : null,
      isFullyPaid: invoice.status === 'paid',
      portalUrl: `${appUrl}/i/${invoiceId}`,
    })
    await enqueueEmail({
      studioId,
      toEmail: client.email,
      toName: client.name,
      subject: email.subject,
      bodyHtml: email.html,
      templateSlug:
        opts.changeKind === 'payment' ? 'invoice_payment_recorded' : 'invoice_updated',
      relatedEntityType: 'invoice',
      relatedEntityId: invoiceId,
    })
  } catch (err) {
    console.error('[notifyClientInvoiceChanged] failed (non-fatal):', err)
  }
}

// ----------------------------------------------------------------------------
// Estados: enviar, marcar pagada, eliminar
// ----------------------------------------------------------------------------

export async function sendInvoice(
  studioId: string,
  actorId: string,
  invoiceId: string,
) {
  const existing = await invoicesRepo.findById(invoiceId)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('INVOICE_NOT_FOUND')
  }

  const invoice = await invoicesRepo.update(invoiceId, {
    status: 'sent',
    sent_at: new Date().toISOString(),
    issued_at: existing.issued_at ?? new Date().toISOString(),
  })

  await logActivity({
    studioId,
    actorId,
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'invoice.sent',
  })

  // F4: auto-emit NCF si el studio tiene tax_config.default_ncf_type configurado
  // y la invoice no tenía NCF asignado todavía. Best-effort: si falla
  // (sin secuencia activa, sin RNC del cliente para tipos restrictivos),
  // log warning pero NO bloquea el send — el user puede emitir NCF manualmente
  // después desde el botón "Emitir NCF" en /invoices/[id].
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoiceAsAny = invoice as any
  if (!invoiceAsAny?.ncf) {
    try {
      const { getTaxConfig, issueNcfForInvoice } = await import(
        "./fiscal-ncf.service"
      )
      const taxConfig = await getTaxConfig(studioId)
      if (taxConfig?.default_ncf_type) {
        await issueNcfForInvoice(studioId, actorId, invoiceId)
        console.log(`[invoice.sent] NCF auto-asignado a invoice ${invoiceId}`)
      }
    } catch (err) {
      console.warn(
        `[invoice.sent] auto-NCF falló (non-fatal):`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  // Dispatch automation + outbound webhook (best-effort)
  void (async () => {
    const payload = {
      client_id: existing.client_id,
      total: Number(invoice?.total ?? 0),
      currency: invoice?.currency,
    }

    try {
      const { dispatchAutomationEvent } = await import('./automation.service')
      await dispatchAutomationEvent({
        studioId,
        event: 'invoice.sent',
        entityType: 'invoice',
        entityId: invoiceId,
        payload,
      })
    } catch (err) {
      console.error('[invoice] automation dispatch (sent) failed:', err)
    }

    try {
      const { dispatchOutboundWebhook } = await import(
        './outbound-webhook.service'
      )
      await dispatchOutboundWebhook({
        studioId,
        eventType: 'invoice.sent',
        payload,
        entityType: 'invoice',
        entityId: invoiceId,
      })
    } catch (err) {
      console.error('[invoice] outbound webhook (sent) failed:', err)
    }
  })()

  return invoice
}

/**
 * Registra un pago en estado `completed`. El trigger SQL
 * `apply_payment_to_invoice` se encarga de actualizar el invoice
 * (amount_paid, status paid|partially_paid, paid_at).
 */
export async function markInvoicePaid(
  studioId: string,
  actorId: string,
  invoiceId: string,
  paymentData: {
    amount: number
    method: string
    reference?: string
    paidAt?: Date
  },
) {
  const existing = await invoicesRepo.findById(invoiceId)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('INVOICE_NOT_FOUND')
  }

  const supabase = createSupabaseServerClient()
  const receivedAt = paymentData.paidAt ?? new Date()

  const { error } = await supabase.from('payments').insert({
    studio_id: studioId,
    invoice_id: invoiceId,
    project_id: existing.project_id,
    client_id: existing.client_id,
    amount: paymentData.amount,
    currency: existing.currency,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    method: paymentData.method as any,
    status: 'completed',
    transaction_reference: paymentData.reference ?? null,
    received_at: receivedAt.toISOString(),
    confirmed_at: receivedAt.toISOString(),
    confirmed_by: actorId || null,
  })

  if (error) throwServiceError("PAYMENT_RECORD_FAILED", error, { studioId, invoiceId })

  await logActivity({
    studioId,
    actorId,
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'invoice.payment_recorded',
    metadata: { amount: paymentData.amount, method: paymentData.method },
  })

  // El trigger ya actualizó el invoice; devolvemos el estado nuevo
  const updated = await invoicesRepo.findById(invoiceId)

  // Notificar al cliente que registramos su pago (best-effort, no bloquea)
  await notifyClientInvoiceChanged(studioId, invoiceId, {
    changeKind: 'payment',
    paymentAmount: paymentData.amount,
  })

  // Si el invoice quedó totalmente pagado, dispatch invoice.paid
  if (updated?.status === 'paid') {
    void (async () => {
      const payload = {
        client_id: existing.client_id,
        total: Number(updated.total ?? 0),
        payment_method: paymentData.method,
      }

      try {
        const { dispatchAutomationEvent } = await import('./automation.service')
        await dispatchAutomationEvent({
          studioId,
          event: 'invoice.paid',
          entityType: 'invoice',
          entityId: invoiceId,
          payload,
        })
      } catch (err) {
        console.error('[invoice] automation dispatch (paid) failed:', err)
      }

      try {
        const { dispatchOutboundWebhook } = await import(
          './outbound-webhook.service'
        )
        await dispatchOutboundWebhook({
          studioId,
          eventType: 'invoice.paid',
          payload,
          entityType: 'invoice',
          entityId: invoiceId,
        })
        await dispatchOutboundWebhook({
          studioId,
          eventType: 'payment.received',
          payload: {
            ...payload,
            amount: paymentData.amount,
            method: paymentData.method,
          },
          entityType: 'invoice',
          entityId: invoiceId,
        })
      } catch (err) {
        console.error('[invoice] outbound webhook (paid) failed:', err)
      }
    })()
  }

  return {
    newStatus: updated?.status ?? 'pending',
    totalPaid: Number(updated?.amount_paid ?? 0),
    projectId: existing.project_id ?? null,
  }
}

export async function deleteInvoice(
  studioId: string,
  actorId: string,
  invoiceId: string,
) {
  const existing = await invoicesRepo.findById(invoiceId)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('INVOICE_NOT_FOUND')
  }

  await invoicesRepo.update(invoiceId, {
    deleted_at: new Date().toISOString(),
  })

  await logActivity({
    studioId,
    actorId,
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'invoice.deleted',
  })
}

// ----------------------------------------------------------------------------
// Finanzas (dashboard)
// ----------------------------------------------------------------------------

export async function getFinanceSummary(studioId: string) {
  const supabase = createSupabaseServerClient()

  const [invoicesResult, paymentsResult] = await Promise.all([
    supabase
      .from('invoices')
      .select('status,total,currency')
      .eq('studio_id', studioId)
      .is('deleted_at', null),
    supabase
      .from('payments')
      .select('amount,received_at,status')
      .eq('studio_id', studioId)
      .eq('status', 'completed')
      .is('deleted_at', null),
  ])

  if (invoicesResult.error) throwServiceError("FINANCE_INVOICES_FAILED", invoicesResult.error, { studioId })
  if (paymentsResult.error) throwServiceError("FINANCE_PAYMENTS_FAILED", paymentsResult.error, { studioId })

  type InvoiceRow = { status: string | null; total: number | string; currency: string | null }
  type PaymentRow = { amount: number | string; received_at: string | null; status: string | null }
  const invoices = (invoicesResult.data ?? []) as InvoiceRow[]
  const payments = (paymentsResult.data ?? []) as PaymentRow[]

  const totalRevenue = payments.reduce(
    (s: number, p: PaymentRow) => s + Number(p.amount),
    0,
  )
  const outstanding = invoices
    .filter((i: InvoiceRow) =>
      ['sent', 'pending', 'partially_paid', 'overdue', 'viewed'].includes(
        String(i.status),
      ),
    )
    .reduce((s: number, i: InvoiceRow) => s + Number(i.total), 0)
  const draft = invoices
    .filter((i: InvoiceRow) => i.status === 'draft')
    .reduce((s: number, i: InvoiceRow) => s + Number(i.total), 0)
  const overdue = invoices.filter((i: InvoiceRow) => i.status === 'overdue').length

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const recentPayments = payments
    .filter(
      (p: { received_at: string | null }) =>
        p.received_at && new Date(p.received_at) >= sixMonthsAgo,
    )
    .map((p: { amount: number | string; received_at: string | null }) => ({
      amount: Number(p.amount),
      paidAt: p.received_at ? new Date(p.received_at) : new Date(),
    }))

  return { totalRevenue, outstanding, draft, overdue, recentPayments }
}
