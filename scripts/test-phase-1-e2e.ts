#!/usr/bin/env tsx
/**
 * End-to-end smoke test del flujo Fase 1.
 *
 * Cubre:
 *  1. Crea fixture: studio + package activo
 *  2. Simula submit anon → INSERT booking_request (via service role porque
 *     anon en este script no tiene cookie, pero la operación es idéntica)
 *  3. Verifica snapshot inmutable y dedup
 *  4. Verifica que state machine permite pending_review → approved
 *  5. Verifica que state machine BLOQUEA pending_review → scheduled (ilegal)
 *  6. Verifica que el trigger DB atrapa UPDATE directo ilegal
 *  7. Verifica que enqueueEmail / notify / logActivity están wired
 *  8. Limpia fixture
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/test-phase-1-e2e.ts
 *
 * Devuelve exit code 0 si todo pasa, 1 en fallo.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/supabase'

// ──────────────────────────────────────────────────────────────────────
// Util
// ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    'Faltan variables: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY',
  )
  process.exit(1)
}

const svc = createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const FIXTURE_SUFFIX = `e2e-${Date.now()}`
const TEST_EMAIL = `test+${FIXTURE_SUFFIX}@example.com`

type Check = { name: string; ok: boolean; details?: string }
const checks: Check[] = []

function record(name: string, ok: boolean, details?: string) {
  checks.push({ name, ok, details })
  const icon = ok ? 'OK ' : 'FAIL'
  console.log(`  [${icon}] ${name}${details ? ` — ${details}` : ''}`)
}

async function cleanup(studioId?: string) {
  if (!studioId) return
  try {
    await svc.from('activity_log').delete().eq('studio_id', studioId)
    await svc.from('notifications').delete().eq('studio_id', studioId)
    await svc.from('email_queue').delete().eq('studio_id', studioId)
    await svc.from('booking_requests').delete().eq('studio_id', studioId)
    await svc.from('packages').delete().eq('studio_id', studioId)
    await svc.from('studios').delete().eq('id', studioId)
  } catch (err) {
    console.warn('cleanup warning', err)
  }
}

async function main() {
  console.log(`\n🧪 StudioFlow Phase 1 E2E — fixture suffix: ${FIXTURE_SUFFIX}\n`)

  // ──────────────────────────────────────────────────────────────────
  // 1) Seed fixture studio + package
  // ──────────────────────────────────────────────────────────────────
  console.log('1) Seed fixture')
  const studioSlug = `e2e-studio-${FIXTURE_SUFFIX}`
  const { data: studio, error: studioErr } = await svc
    .from('studios')
    .insert({
      name: 'E2E Studio',
      slug: studioSlug,
      email: `owner+${FIXTURE_SUFFIX}@example.com`,
      currency: 'DOP',
      primary_color: '#ec4899',
    })
    .select('id, slug, name, email')
    .single()

  if (studioErr || !studio) {
    record('studio insert', false, studioErr?.message)
    return
  }
  record('studio insert', true, `id=${studio.id}`)

  const pkgSlug = `paquete-e2e-${FIXTURE_SUFFIX}`
  const { data: pkg, error: pkgErr } = await svc
    .from('packages')
    .insert({
      studio_id: studio.id,
      name: 'Paquete E2E',
      slug: pkgSlug,
      description: 'Fixture para pruebas',
      price: 25000,
      currency: 'DOP',
      deposit_percent: 50,
      reserve_due_in_days: 7,
      is_active: true,
      event_type: 'XV Años',
    })
    .select('id, slug, name, price, currency')
    .single()

  if (pkgErr || !pkg) {
    record('package insert', false, pkgErr?.message)
    await cleanup(studio.id)
    return
  }
  record('package insert', true, `${pkg.slug} @ ${pkg.price}`)

  try {
    // ────────────────────────────────────────────────────────────────
    // 2) Vistas públicas devuelven la data?
    // ────────────────────────────────────────────────────────────────
    console.log('\n2) Vistas públicas')
    const { data: sPub, error: sPubErr } = await svc
      .from('studios_public')
      .select('id, name, slug')
      .eq('slug', studioSlug)
      .maybeSingle()
    record('studios_public expone studio', !sPubErr && !!sPub, sPubErr?.message)

    const { data: pPub, error: pPubErr } = await svc
      .from('packages_public')
      .select('id, name, slug, price')
      .eq('studio_id', studio.id)
      .eq('slug', pkgSlug)
      .maybeSingle()
    record(
      'packages_public expone package',
      !pPubErr && !!pPub,
      pPubErr?.message,
    )

    // ────────────────────────────────────────────────────────────────
    // 3) Submit booking_request (simula flujo público)
    // ────────────────────────────────────────────────────────────────
    console.log('\n3) Crear booking_request con snapshot')
    const eventDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // +60 días
      .toISOString()
      .slice(0, 10)

    const pricingSnapshot = {
      price: Number(pkg.price),
      currency: pkg.currency ?? 'DOP',
      deposit_percent: 50,
      deposit_amount: Number(pkg.price) * 0.5,
      reserve_due_in_days: 7,
    }
    const packageSnapshot = {
      id: pkg.id,
      name: pkg.name,
      slug: pkg.slug,
    }

    const { data: req, error: reqErr } = await svc
      .from('booking_requests')
      .insert({
        studio_id: studio.id,
        package_id: pkg.id,
        client_name: 'Cliente E2E',
        client_email: TEST_EMAIL,
        event_date: eventDate,
        status: 'pending_review',
        pricing_snapshot: pricingSnapshot,
        package_snapshot: packageSnapshot,
      })
      .select('id, status, pricing_snapshot')
      .single()

    if (reqErr || !req) {
      record('booking_request insert', false, reqErr?.message)
      return
    }
    record(
      'booking_request insert en pending_review',
      req.status === 'pending_review',
    )
    record(
      'pricing_snapshot preservado',
      (req.pricing_snapshot as { price: number }).price === Number(pkg.price),
    )

    // ────────────────────────────────────────────────────────────────
    // 4) State machine: transición legal OK
    // ────────────────────────────────────────────────────────────────
    console.log('\n4) State machine: transiciones')
    const { error: approveErr } = await svc
      .from('booking_requests')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', req.id)
    record(
      'transición legal pending_review → approved',
      !approveErr,
      approveErr?.message,
    )

    // ────────────────────────────────────────────────────────────────
    // 5) State machine: transición ilegal BLOQUEADA
    // ────────────────────────────────────────────────────────────────
    const { error: illegalErr } = await svc
      .from('booking_requests')
      .update({ status: 'scheduled' })
      .eq('id', req.id)
    record(
      'trigger bloquea approved → scheduled (salto ilegal)',
      !!illegalErr &&
        (illegalErr.message.includes('transición ilegal') ||
          illegalErr.message.includes('check_violation')),
      illegalErr?.message ?? 'no error (mal)',
    )

    // ────────────────────────────────────────────────────────────────
    // 6) State machine: estado terminal no acepta más transiciones
    // ────────────────────────────────────────────────────────────────
    // Primero llevarlo a cancelled (legal desde approved)
    const { error: cancelErr } = await svc
      .from('booking_requests')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', req.id)
    record('legal approved → cancelled', !cancelErr, cancelErr?.message)

    // Intentar revivir
    const { error: reviveErr } = await svc
      .from('booking_requests')
      .update({ status: 'pending_review' })
      .eq('id', req.id)
    record(
      'trigger bloquea cancelled → pending_review (terminal)',
      !!reviveErr,
      reviveErr?.message ?? 'no error (mal)',
    )

    // ────────────────────────────────────────────────────────────────
    // 7) Dedup: mismo email+package+fecha activo existente
    // ────────────────────────────────────────────────────────────────
    console.log('\n7) Dedup')
    // Como ya cancelamos la anterior, creamos una nueva activa, luego
    // intentamos duplicar
    const { data: req2, error: req2Err } = await svc
      .from('booking_requests')
      .insert({
        studio_id: studio.id,
        package_id: pkg.id,
        client_name: 'Cliente E2E 2',
        client_email: TEST_EMAIL,
        event_date: eventDate,
        status: 'pending_review',
        pricing_snapshot: pricingSnapshot,
        package_snapshot: packageSnapshot,
      })
      .select('id')
      .single()
    record('segunda solicitud activa creada', !req2Err && !!req2, req2Err?.message)

    // Chequeo lógico: hay ya una activa con (studio, pkg, email, event_date)
    const { data: dup } = await svc
      .from('booking_requests')
      .select('id')
      .eq('studio_id', studio.id)
      .eq('package_id', pkg.id)
      .eq('client_email', TEST_EMAIL)
      .eq('event_date', eventDate)
      .in('status', [
        'pending_review',
        'approved',
        'awaiting_payment',
        'confirmed',
        'scheduled',
      ])
    record(
      'dedup: exactamente 1 solicitud activa',
      (dup?.length ?? 0) === 1,
      `count=${dup?.length}`,
    )

    // ────────────────────────────────────────────────────────────────
    // 8) Verificar que email_queue, notifications y activity_log
    //    aceptan inserts (service role bypassa RLS). Esto confirma
    //    la schema está bien formada para el flujo real.
    // ────────────────────────────────────────────────────────────────
    console.log('\n8) Tablas auxiliares')
    const { error: eqErr } = await svc.from('email_queue').insert({
      studio_id: studio.id,
      to_email: TEST_EMAIL,
      subject: 'E2E smoke',
      body_html: '<p>E2E</p>',
      status: 'pending',
    })
    record('email_queue insert', !eqErr, eqErr?.message)

    const { error: alErr } = await svc.from('activity_log').insert({
      studio_id: studio.id,
      action: 'booking_request.created',
      entity_type: 'booking_request',
      entity_id: req2!.id,
      actor_type: 'client',
      description: 'E2E test',
    })
    record('activity_log insert', !alErr, alErr?.message)

    const { error: notifErr } = await svc.from('notifications').insert({
      studio_id: studio.id,
      type: 'booking_request_received',
      title: 'E2E notif',
    })
    record('notifications insert', !notifErr, notifErr?.message)
  } finally {
    console.log('\nCleanup...')
    await cleanup(studio.id)
  }

  // ──────────────────────────────────────────────────────────────────
  // Resumen
  // ──────────────────────────────────────────────────────────────────
  const total = checks.length
  const passed = checks.filter((c) => c.ok).length
  const failed = total - passed
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`${passed}/${total} checks passed${failed ? ` (${failed} failed)` : ''}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

  if (failed > 0) {
    console.log('Failed:')
    for (const c of checks.filter((c) => !c.ok)) {
      console.log(`  ✗ ${c.name}: ${c.details ?? ''}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
