import 'server-only'

import { createId } from '@paralleldrive/cuid2'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createSupabaseServiceClient } from '@/server/supabase/service'
import { resolveStudioBySlug, notifyStudioOfNewLead } from './lead.service'

/**
 * Selección de vestidos del catálogo de abbypixel.com.
 * El cliente elige 4–6 vestidos para probarse en su sesión; la selección se
 * guarda con un token (link compartible que muestra los vestidos) y además se
 * registra como lead en el CRM con su nombre y WhatsApp.
 */

export type DressItem = {
  name: string
  image: string
  collection?: string | null
}

export type CreateDressSelectionInput = {
  studioSlug: string
  clientName: string
  whatsapp: string
  tentativeDate?: string | null
  planInterest?: string | null
  dresses: DressItem[]
}

export type CreateDressSelectionResult =
  | { status: 'ok'; token: string; url: string; leadId: string | null }
  | { status: 'not_found' }

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://my.abbypixel.com'
  ).replace(/\/$/, '')
}

export async function createDressSelection(
  input: CreateDressSelectionInput,
): Promise<CreateDressSelectionResult> {
  const studio = await resolveStudioBySlug(input.studioSlug)
  if (!studio) return { status: 'not_found' }

  const service = createSupabaseServiceClient()
  // dress_selections aún no está en los tipos generados → cliente sin tipar.
  const db = service as unknown as SupabaseClient
  const token = createId()
  const url = `${appBaseUrl()}/vestidos/${token}`
  const name = input.clientName.trim()
  const whatsapp = input.whatsapp.trim()

  // 1) Guardar la selección PRIMERO — es el entregable principal (el link).
  //    El lead es "además" y va best-effort para no perder la selección.
  const { error: selErr } = await db.from('dress_selections').insert({
    studio_id: studio.id,
    token,
    client_name: name,
    client_whatsapp: whatsapp,
    tentative_date: input.tentativeDate?.trim() || null,
    plan_interest: input.planInterest?.trim() || null,
    dresses: input.dresses,
    lead_id: null,
  })
  if (selErr) {
    console.error('[dress-selection] insert failed', selErr)
    throw new Error('No se pudo guardar la selección')
  }

  // 2) Registrar el lead (nombre + WhatsApp) con el link en notas — best-effort.
  let leadId: string | null = null
  try {
    const dressNames = input.dresses.map((d) => d.name).filter(Boolean)
    const notesParts = [
      `Selección de ${input.dresses.length} vestidos para probarse: ${url}`,
    ]
    if (dressNames.length) notesParts.push(`Vestidos: ${dressNames.join(', ')}`)
    if (input.planInterest?.trim())
      notesParts.push(`Plan de interés: ${input.planInterest.trim()}`)
    if (input.tentativeDate?.trim())
      notesParts.push(`Fecha tentativa: ${input.tentativeDate.trim()}`)

    const { data: lead } = await service
      .from('leads')
      .insert({
        studio_id: studio.id,
        name,
        phone: whatsapp || null,
        source: 'website',
        status: 'new',
        event_type: input.planInterest?.trim() || 'quinceañera',
        referral: 'Selección de vestidos (abbypixel.com)',
        notes: notesParts.join('\n'),
      })
      .select('id, name')
      .single()

    if (lead) {
      leadId = lead.id
      await db.from('dress_selections').update({ lead_id: leadId }).eq('token', token)

      await notifyStudioOfNewLead({
        studio,
        lead,
        source: 'website',
        clientPhone: whatsapp,
        category: input.planInterest ?? 'Selección de vestidos',
        tentativeDate: input.tentativeDate ?? null,
        message: `Eligió ${input.dresses.length} vestidos para probarse. Ver selección: ${url}`,
        formName: 'Selección de vestidos',
      })
    }
  } catch (e) {
    console.error('[dress-selection] lead create/notify failed (best-effort)', e)
  }

  return { status: 'ok', token, url, leadId }
}

export type DressSelectionView = {
  clientName: string
  tentativeDate: string | null
  planInterest: string | null
  dresses: DressItem[]
  createdAt: string
}

export async function getDressSelectionByToken(
  token: string,
): Promise<DressSelectionView | null> {
  if (!token) return null
  const db = createSupabaseServiceClient() as unknown as SupabaseClient
  const { data } = await db
    .from('dress_selections')
    .select('client_name, tentative_date, plan_interest, dresses, created_at')
    .eq('token', token)
    .maybeSingle()
  if (!data) return null
  const d = data as unknown as {
    client_name: string
    tentative_date: string | null
    plan_interest: string | null
    dresses: unknown
    created_at: string
  }
  return {
    clientName: d.client_name,
    tentativeDate: d.tentative_date,
    planInterest: d.plan_interest,
    dresses: Array.isArray(d.dresses) ? (d.dresses as DressItem[]) : [],
    createdAt: d.created_at,
  }
}
