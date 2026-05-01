// Deprecated — NextAuth fue reemplazado por Supabase Auth (2026-04-18).
// Este handler queda como stub que devuelve 410 Gone para cualquier request.
// Los viejos clientes deben apuntar a /auth/callback, /auth/signout o
// a las server actions en app/(auth)/actions.ts.

import { NextResponse } from 'next/server'

export const GET = () =>
  NextResponse.json(
    { error: 'Gone. Auth migrado a Supabase. Usa /login o /auth/callback.' },
    { status: 410 },
  )

export const POST = GET
