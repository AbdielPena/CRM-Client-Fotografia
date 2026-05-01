'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createSupabaseServerClient } from '@/server/supabase/server'

export type SetupActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }

const setupSchema = z.object({
  studioName: z.string().trim().min(2, 'Nombre muy corto').max(120),
  ownerName: z.string().trim().min(2, 'Tu nombre').max(120),
})

export async function bootstrapStudioAction(
  _prev: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  const parsed = setupSchema.safeParse({
    studioName: formData.get('studioName'),
    ownerName: formData.get('ownerName'),
  })
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Datos inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const supabase = createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Si ya tiene studio (carrera / retry), mandar al dashboard directo
  const { data: existing } = await supabase
    .from('studio_members')
    .select('studio_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (existing) {
    redirect('/dashboard')
  }

  const { error: rpcError } = await supabase.rpc('bootstrap_studio_for_current_user', {
    p_studio_name: parsed.data.studioName,
    p_owner_name: parsed.data.ownerName,
  } as never)

  if (rpcError) {
    console.error('[bootstrapStudioAction] rpc failed:', rpcError)
    return {
      status: 'error',
      message: `No pudimos crear tu studio: ${rpcError.message}`,
    }
  }

  redirect('/dashboard')
}
