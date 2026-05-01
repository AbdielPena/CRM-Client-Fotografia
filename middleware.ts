import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseMiddlewareClient } from '@/server/supabase/middleware-client'

// Rutas públicas: no requieren autenticación.
const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth', // callbacks OAuth / magic link
  '/invite',
  '/g/', // galerías públicas
  '/portal/', // portal cliente
  '/p/', // links públicos de booking
  '/sign/', // firma pública de contrato (también abre la factura 50%)
  '/i/', // factura pública
  '/f/', // formularios públicos
  '/api/auth', // endpoints de auth
  '/api/webhooks',
  '/api/health',
  '/api/public',
  '/_next',
  '/favicon',
]

export async function middleware(req: NextRequest) {
  const { supabase, response } = createSupabaseMiddlewareClient(req)

  // Refrescar sesión — Supabase puede rotar el access token aquí.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  if (isPublic) return response

  // Sin sesión → login
  if (!user) {
    const url = new URL('/login', req.url)
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  // Con sesión pero sin studio activo (intermedio de onboarding)
  // Lo chequeamos via studio_members. Una sola query por request.
  const { data: member } = await supabase
    .from('studio_members')
    .select('studio_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!member && pathname !== '/setup') {
    return NextResponse.redirect(new URL('/setup', req.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.svg$|.*\\.webp$|.*\\.ico$).*)',
  ],
}
