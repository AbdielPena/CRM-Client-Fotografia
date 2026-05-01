'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createSupabaseServerClient } from '@/server/supabase/server'

// ─── Validación ─────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nombre muy corto').max(120),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(128),
  studioName: z.string().trim().min(2, 'Nombre del studio requerido').max(120),
})

const resetSchema = z.object({
  email: z.string().email('Email inválido'),
})

// ─── Tipos de retorno (compatible con useActionState) ───────────────────────

export type AuthActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }
  | { status: 'success'; message?: string }

// ─── signIn ─────────────────────────────────────────────────────────────────

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Datos inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const supabase = createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { status: 'error', message: 'Email o contraseña incorrectos' }
  }

  const callbackUrl = (formData.get('callbackUrl') as string) || '/dashboard'
  redirect(callbackUrl)
}

// ─── signUp (con bootstrap de studio atómico) ───────────────────────────────

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    studioName: formData.get('studioName'),
  })
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Datos inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const supabase = createSupabaseServerClient()

  // 1. Crear user
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.name,
      },
    },
  })

  if (signUpError) {
    if (signUpError.message.toLowerCase().includes('already')) {
      return { status: 'error', message: 'Este email ya está registrado' }
    }
    return { status: 'error', message: signUpError.message }
  }

  if (!signUpData.session) {
    // Email confirmation habilitado → no hay sesión todavía.
    return {
      status: 'success',
      message: 'Revisa tu correo para confirmar la cuenta.',
    }
  }

  // 2. Bootstrap del studio (crea studio + membership + subscription)
  const { error: rpcError } = await supabase.rpc('bootstrap_studio_for_current_user', {
    p_studio_name: parsed.data.studioName,
    p_owner_name: parsed.data.name,
  } as never)
  if (rpcError) {
    // Rollback el user sería ideal pero requiere service role.
    // Por ahora devolvemos error para que el user contacte soporte.
    console.error('[signUpAction] bootstrap failed:', rpcError)
    return {
      status: 'error',
      message:
        'Cuenta creada pero no pudimos configurar tu studio. Contacta soporte con este email.',
    }
  }

  redirect('/dashboard')
}

// ─── signOut ────────────────────────────────────────────────────────────────

export async function signOutAction(): Promise<void> {
  const supabase = createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}

// ─── Solicitud de reset de password ─────────────────────────────────────────

export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Email inválido',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const supabase = createSupabaseServerClient()
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  if (error) {
    return { status: 'error', message: error.message }
  }

  // Mensaje genérico (no revelar si el email existe o no)
  return {
    status: 'success',
    message: 'Si el email está registrado, recibirás un correo para restablecer tu contraseña.',
  }
}
