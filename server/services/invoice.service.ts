import 'server-only'

import { invoicesRepo } from '@/server/repositories'
import { createSupabaseServerClient } from '@/server/supabase/server'
import type { CreateInvoiceInput } from '@/lib/validations/invoice.schema'
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
  if (error) throw new Error(error.message)

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

  if (error) throw new Error(error.message)
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

export async function createInvoice(
  studioId: string,
  actorId: string,
  data: CreateInvoiceInput,
) {
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

  if (error) {
    console.error('[markInvoicePaid] failed', error)
    throw new Error(error.message)
  }

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
  return {
    newStatus: updated?.status ?? 'pending',
    totalPaid: Number(updated?.amount_paid ?? 0),
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

  if (invoicesResult.error) throw new Error(invoicesResult.error.message)
  if (paymentsResult.error) throw new Error(paymentsResult.error.message)

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
