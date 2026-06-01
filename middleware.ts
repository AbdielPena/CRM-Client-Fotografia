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
  '/portal', // portal cliente (matchea /portal y /portal/...)
  '/api/portal', // endpoints del portal (login, logout)
  '/contract-print', // página print del contrato (auth interna por path)
  '/invoice-print', // página print de factura (auth interna por path)
  '/p/', // links públicos de booking
  '/b/', // hub de confirmación del cliente (revisar plan → formulario → firma → pago)
  '/r/', // registro público de cliente (sin paquete)
  '/sign/', // firma pública de contrato (también abre la factura 50%)
  '/i/', // factura pública
  '/f/', // formularios públicos
  '/api/auth', // endpoints de auth
  '/api/webhooks',
  '/api/health',
  '/api/public',
  '/api/deploy', // hooks de deploy desde GitHub Actions (auth por Bearer interno)
  '/_next',
  '/favicon',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))

  const { supabase, response } = createSupabaseMiddlewareClient(req)

  // Refrescar sesión — Supabase rota el access token automáticamente.
  // En rutas públicas también lo hacemos para que el siguiente nav
  // protegido no necesite refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (isPublic) return response

  // Sin sesión → login
  if (!user) {
    const url = new URL('/login', req.url)
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  // El check de studio activo (studio_members) lo hace el server component
  // con `requireStudioAuth()` / `getAuthContext()` que está cacheado por
  // request con React `cache()`. Hacerlo aquí también duplicaba la query
  // y agregaba ~80-150ms a CADA navegación.
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.svg$|.*\\.webp$|.*\\.ico$).*)',
  ],
}
