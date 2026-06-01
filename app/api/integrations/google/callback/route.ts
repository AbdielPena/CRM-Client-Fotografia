import { NextResponse, type NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

import {
  exchangeCodeForTokens,
  saveIntegration,
} from '@/server/services/google-calendar.service'
import { getAuthContext } from '@/server/supabase/auth-context'

/**
 * Callback de Google OAuth. El state se firma con HMAC para evitar CSRF
 * y recuperar el studioId.
 *
 * Formato state: `<base64(studioId)>.<hmac>`
 */

function verifyState(state: string): string | null {
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret) return null
  const [payload, signature] = state.split('.')
  if (!payload || !signature) return null

  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  try {
    const a = Buffer.from(signature, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return null
    if (!timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  try {
    return Buffer.from(payload, 'base64').toString('utf8')
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  // Detrás del proxy (CloudPanel/nginx) req.url es la dirección interna
  // (p.ej. http://localhost:3001). Para redirigir de vuelta al navegador
  // usamos la URL pública configurada; si no existe, caemos al origin real.
  const appBase = process.env.NEXT_PUBLIC_APP_URL || url.origin
  const redirectBase = `/settings/integrations/google`

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`${redirectBase}?error=${encodeURIComponent(errorParam)}`, appBase),
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL(`${redirectBase}?error=missing_params`, appBase))
  }

  const studioIdFromState = verifyState(state)
  if (!studioIdFromState) {
    return NextResponse.redirect(new URL(`${redirectBase}?error=invalid_state`, appBase))
  }

  // Doble check: la sesión activa debe corresponder al studioId del state
  const ctx = await getAuthContext()
  if (!ctx || ctx.studioId !== studioIdFromState) {
    return NextResponse.redirect(new URL(`${redirectBase}?error=session_mismatch`, appBase))
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    await saveIntegration(studioIdFromState, tokens)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return NextResponse.redirect(
      new URL(`${redirectBase}?error=${encodeURIComponent(msg)}`, appBase),
    )
  }

  return NextResponse.redirect(new URL(`${redirectBase}?connected=1`, appBase))
}
