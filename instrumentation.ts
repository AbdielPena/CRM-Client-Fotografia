/**
 * Next.js Instrumentation Hook
 * Se ejecuta una sola vez al arrancar el servidor (Node.js runtime).
 * Usamos esto para validar variables de entorno antes de servir requests.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env")
    validateEnv()
  }
}
