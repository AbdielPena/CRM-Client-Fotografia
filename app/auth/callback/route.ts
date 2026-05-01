import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseServerClient } from '@/server/supabase/server'

/**
 * Callback OAuth + magic link + password reset.
 * Supabase redirige aquí con ?code=<code> que intercambiamos por una sesión.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/callback] exchange error:', error.message)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
