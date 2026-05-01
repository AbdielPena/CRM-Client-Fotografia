import 'server-only'

import { createSupabaseServiceClient } from '@/server/supabase/service'
import {
  enqueueEmail,
  renderContractInvitation,
  renderInvoiceReserve,
} from './email.service'

/**
 * Dispara los 2 emails automáticos post-booking:
 *   1. Contrato (link a firma digital)
 *   2. Factura del 50% de reserva (link al portal del cliente)
 *
 * Llamado desde `createClientAction` después de que el RPC
 * `create_client_with_booking` termine exitosamente.
 *
 * Best-effort: si un email falla, queda en `email_queue` con status='failed'
 * para retry manual. No bloquea el flujo de creación del cliente.
 */
export async function sendAutoContractAndInvoiceEmails(params: {
  studioId: string
  clientId: string
  projectId: string
  contractId: string
  invoice1Id: string
}): Promise<{ contractEmailId?: string; invoiceEmailId?: string }> {
  const { studioId, clientId, projectId, contractId, invoice1Id } = params
  const supabase = createSupabaseServiceClient()

  // Fetch en paralelo: studio, cliente, proyecto, contrato, factura
  const [studioRes, clientRes, projectRes, contractRes, invoiceRes] = await Promise.all([
    supabase.from('studios').select('name, primary_color').eq('id', studioId).maybeSingle(),
    supabase.from('clients').select('name, email').eq('id', clientId).maybeSingle(),
    supabase
      .from('projects')
      .select('name, event_type, event_date')
      .eq('id', projectId)
      .maybeSingle(),
    supabase
      .from('contracts')
      .select('signing_token')
      .eq('id', contractId)
      .maybeSingle(),
    supabase
      .from('invoices')
      .select('invoice_number, total, currency, due_date')
      .eq('id', invoice1Id)
      .maybeSingle(),
  ])

  const studio = studioRes.data
  const client = clientRes.data
  const project = projectRes.data
  const contract = contractRes.data
  const invoice = invoiceRes.data

  // Sin email del cliente no hay a quién enviar
  if (!client?.email) {
    console.warn(
      '[post-booking-emails] cliente sin email — no se encolan emails automáticos',
    )
    return {}
  }

  if (!studio || !project || !contract || !invoice) {
    console.error('[post-booking-emails] datos incompletos', {
      hasStudio: !!studio,
      hasProject: !!project,
      hasContract: !!contract,
      hasInvoice: !!invoice,
    })
    return {}
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const signingUrl = `${appUrl}/sign/${contract.signing_token}`
  // La factura pública usa el UUID de la factura como capability URL.
  // La vista `/i/[id]` muestra detalle de factura + link al contrato si
  // aún no está firmado.
  const portalUrl = `${appUrl}/i/${invoice1Id}`

  const eventDateFormatted = formatEventDate(project.event_date ?? '')
  const eventTypeLabel = formatEventType(project.event_type ?? '')
  const totalFormatted = formatMoney(invoice.total, invoice.currency ?? 'DOP')
  const dueDateFormatted = invoice.due_date ? formatEventDate(invoice.due_date) : null

  const contractEmail = renderContractInvitation({
    studioName: studio.name,
    primaryColor: studio.primary_color ?? '#7c3aed',
    clientName: firstName(client.name),
    projectName: project.name,
    eventType: eventTypeLabel,
    eventDate: eventDateFormatted,
    signingUrl,
  })

  const invoiceEmail = renderInvoiceReserve({
    studioName: studio.name,
    primaryColor: studio.primary_color ?? '#7c3aed',
    clientName: firstName(client.name),
    projectName: project.name,
    eventType: eventTypeLabel,
    eventDate: eventDateFormatted,
    invoiceNumber: invoice.invoice_number,
    totalFormatted,
    dueDate: dueDateFormatted,
    portalUrl,
  })

  const [contractEmailId, invoiceEmailId] = await Promise.all([
    enqueueEmail({
      studioId,
      toEmail: client.email,
      toName: client.name,
      subject: contractEmail.subject,
      bodyHtml: contractEmail.html,
      templateSlug: 'auto_contract_invitation',
      relatedEntityType: 'contract',
      relatedEntityId: contractId,
    }).catch((err) => {
      console.error('[post-booking-emails] fallo encolar contrato:', err)
      return undefined
    }),
    enqueueEmail({
      studioId,
      toEmail: client.email,
      toName: client.name,
      subject: invoiceEmail.subject,
      bodyHtml: invoiceEmail.html,
      templateSlug: 'auto_invoice_reserve',
      relatedEntityType: 'invoice',
      relatedEntityId: invoice1Id,
    }).catch((err) => {
      console.error('[post-booking-emails] fallo encolar factura:', err)
      return undefined
    }),
  ])

  return { contractEmailId, invoiceEmailId }
}

// ──────────────────────────────────────────────────────────────────────
// Formatters
// ──────────────────────────────────────────────────────────────────────

function firstName(fullName: string): string {
  return fullName.split(/\s+/)[0] ?? fullName
}

function formatEventDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es-DO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatEventType(type: string): string {
  const map: Record<string, string> = {
    quinceanera: 'XV años',
    wedding: 'boda',
    engagement: 'pre-boda',
    maternity: 'sesión de maternidad',
    newborn: 'sesión newborn',
    family: 'sesión familiar',
    portrait: 'sesión de retrato',
    graduation: 'graduación',
    corporate: 'sesión corporativa',
    event: 'evento',
  }
  return map[type] ?? type.replace(/_/g, ' ')
}

function formatMoney(amount: number | string, currency: string): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  const formatted = new Intl.NumberFormat('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
  return `${currency} ${formatted}`
}
