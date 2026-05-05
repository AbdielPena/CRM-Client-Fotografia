/**
 * Local filesystem storage driver — modo dev sin nube.
 *
 * Activado por env var `STORAGE_DRIVER=local`. En este modo, los archivos de
 * galería se guardan bajo `public/dev-uploads/<bucket>/<key>` (servidos
 * automáticamente por Next.js como assets estáticos en `/dev-uploads/...`).
 *
 * Esto permite probar todo el flujo de subida + procesamiento (Sharp) sin
 * necesidad de Supabase Storage configurado. NO usar en producción —
 * pierde archivos al redeploy y no escala.
 */

import { promises as fs } from "node:fs"
import path from "node:path"

export const LOCAL_PUBLIC_PREFIX = "/dev-uploads"

/** True si el driver local está activo. */
export function isLocalStorage(): boolean {
  return process.env["STORAGE_DRIVER"] === "local"
}

/** Carpeta base en disco donde viven los uploads locales. */
function rootDir(): string {
  return path.join(process.cwd(), "public", "dev-uploads")
}

/** Path absoluto en disco para una key dentro de un bucket. */
export function localFilePath(bucket: string, key: string): string {
  // Sanitización mínima: no permitir saltos de carpeta.
  const safeKey = key.replace(/\.\.+/g, "").replace(/^\/+/, "")
  return path.join(rootDir(), bucket, safeKey)
}

/** URL pública servida por Next.js para un archivo local. */
export function localPublicUrl(bucket: string, key: string | null): string | null {
  if (!key) return null
  return `${LOCAL_PUBLIC_PREFIX}/${bucket}/${key}`
}

/** Guarda un buffer en `bucket/key`, creando carpetas necesarias. */
export async function localWrite(
  bucket: string,
  key: string,
  data: Buffer,
): Promise<void> {
  const filePath = localFilePath(bucket, key)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, data)
}

/** Lee un archivo local como Buffer. Lanza si no existe. */
export async function localRead(bucket: string, key: string): Promise<Buffer> {
  const filePath = localFilePath(bucket, key)
  return await fs.readFile(filePath)
}

/** Borra archivos. No lanza si no existen. */
export async function localRemove(bucket: string, keys: string[]): Promise<void> {
  await Promise.all(
    keys.map(async (k) => {
      try {
        await fs.unlink(localFilePath(bucket, k))
      } catch {
        // ignore — best-effort
      }
    }),
  )
}
