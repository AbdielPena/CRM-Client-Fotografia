import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseServerClient } from '@/server/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient()
  await supabase.auth.signOut()
  const origin = new URL(request.url).origin
  return NextResponse.redirect(`${origin}/login`, { status: 303 })
}
