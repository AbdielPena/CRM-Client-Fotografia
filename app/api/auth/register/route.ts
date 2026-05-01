// Deprecated — el registro ahora usa la server action `signUpAction` en
// app/(auth)/actions.ts que crea el user via Supabase Auth + llama la RPC
// `bootstrap_studio_for_current_user`. Este endpoint queda como stub.

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Gone. El registro ahora usa la server action signUpAction. Usa el form en /register.',
    },
    { status: 410 },
  )
}
