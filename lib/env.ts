/**
 * Validación de variables de entorno requeridas al arranque.
 * Importar en instrumentation.ts o en cualquier módulo de server que se cargue primero.
 * Lanza un error descriptivo en lugar de fallar silenciosamente más tarde.
 */

interface EnvVar {
  key: string
  required: boolean
  description: string
  example?: string
}

const ENV_VARS: EnvVar[] = [
  // Supabase — único backend requerido post-migración
  { key: "NEXT_PUBLIC_SUPABASE_URL", required: true, description: "URL del proyecto Supabase", example: "https://xxx.supabase.co" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, description: "Anon/publishable key de Supabase", example: "sb_publishable_..." },
  { key: "SUPABASE_SERVICE_ROLE_KEY", required: true, description: "Service role key (bypass RLS — solo backend)", example: "sb_secret_..." },

  // App
  { key: "NEXT_PUBLIC_APP_URL", required: false, description: "URL pública de la app (para emails y shares)", example: "http://localhost:3000" },
  { key: "OAUTH_STATE_SECRET", required: false, description: "HMAC secret para firma OAuth state (Google Calendar)", example: "32+ bytes hex" },

  // Auth legacy — NextAuth se usa en transición
  { key: "NEXTAUTH_SECRET", required: false, description: "Secreto NextAuth (legacy, transición)", example: "run: openssl rand -base64 32" },
  { key: "NEXTAUTH_URL", required: false, description: "URL base legacy NextAuth", example: "http://localhost:3000" },

  // Todo lo siguiente es legacy — se mueve a /settings/integrations in-app
  { key: "DATABASE_URL", required: false, description: "Legacy Prisma — ya no requerido", example: "" },
  { key: "REDIS_URL", required: false, description: "Legacy BullMQ — opcional", example: "redis://localhost:6379" },
  { key: "S3_BUCKET_NAME", required: false, description: "Legacy S3/MinIO — reemplazado por Supabase Storage" },
  { key: "S3_ACCESS_KEY_ID", required: false, description: "Legacy S3/MinIO" },
  { key: "S3_SECRET_ACCESS_KEY", required: false, description: "Legacy S3/MinIO" },
  { key: "S3_PUBLIC_URL", required: false, description: "Legacy S3/MinIO" },

  // Google Calendar (opcional)
  { key: "GOOGLE_CLIENT_ID", required: false, description: "OAuth Google Calendar" },
  { key: "GOOGLE_CLIENT_SECRET", required: false, description: "OAuth Google Calendar" },

  // SMTP dev fallback (prod usa studio_integrations por tenant)
  { key: "SMTP_HOST", required: false, description: "SMTP host del hosting", example: "mail.tudominio.com" },
  { key: "SMTP_PORT", required: false, description: "Puerto SMTP (465 SSL / 587 TLS)" },
  { key: "SMTP_SECURE", required: false, description: "true para SSL (port 465), false para TLS/STARTTLS" },
  { key: "SMTP_USER", required: false, description: "Usuario SMTP (email completo)" },
  { key: "SMTP_PASSWORD", required: false, description: "Contraseña del buzón" },
  { key: "SMTP_FROM_EMAIL", required: false, description: "Email remitente" },
  { key: "SMTP_FROM_NAME", required: false, description: "Nombre remitente" },

  // Resend / Stripe — opcionales, via studio_integrations
  { key: "RESEND_API_KEY", required: false, description: "Legacy — ahora via /settings/integrations", example: "re_..." },
  { key: "STRIPE_SECRET_KEY", required: false, description: "Opcional" },
  { key: "STRIPE_WEBHOOK_SECRET", required: false, description: "Opcional" },
]

export function validateEnv(): void {
  // Solo ejecutar en servidor
  if (typeof window !== "undefined") return

  const missing: string[] = []
  const warnings: string[] = []

  for (const v of ENV_VARS) {
    const val = process.env[v.key]
    if (!val || val.trim() === "") {
      if (v.required) {
        missing.push(`  ❌ ${v.key} — ${v.description}${v.example ? `\n     Ejemplo: ${v.example}` : ""}`)
      } else {
        warnings.push(`  ⚠️  ${v.key} — ${v.description} (opcional)`)
      }
    }
  }

  if (warnings.length > 0) {
    console.warn(`\n[PixelOS] Variables opcionales no configuradas:\n${warnings.join("\n")}\n`)
  }

  if (missing.length > 0) {
    const msg =
      `\n\n[PixelOS] ❌ Variables de entorno requeridas no configuradas:\n\n${missing.join("\n")}\n\n` +
      `Copia .env.local.example a .env.local y completa los valores.\n`

    // En producción: lanzar error fatal
    // En desarrollo: solo advertir para no bloquear el servidor
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg)
    } else {
      console.warn(msg)
    }
  }
}

/** Getter tipado con valor de fallback */
export function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback
  if (val === undefined) {
    throw new Error(`[PixelOS] Variable de entorno "${key}" no está definida`)
  }
  return val
}
