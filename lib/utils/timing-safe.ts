import { timingSafeEqual } from "crypto"

/**
 * Comparación de strings en tiempo constante (anti timing-oracle).
 * Úsala para validar secretos (api keys, tokens internos) en vez de `===`,
 * que cortocircuita en el primer byte distinto y filtra longitud/posición.
 */
export function safeEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
