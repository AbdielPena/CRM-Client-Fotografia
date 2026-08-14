import "server-only"

import { getDriveAccessToken } from "@/server/services/google-drive-oauth.service"

/**
 * Cliente de Google Drive (scope `drive.file` — solo archivos/carpetas creados
 * por la app). Usa la conexión de Drive DEDICADA (service='google_drive'),
 * separada de Google Calendar, para poder usar una cuenta de Drive distinta.
 *
 * Usado por gallery-drive.service para respaldar/entregar galerías de entrega
 * final a Drive en dos pistas (Redes / Máxima calidad).
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3"
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
const FOLDER_MIME = "application/vnd.google-apps.folder"

export class DriveNotConnectedError extends Error {
  constructor() {
    super(
      "Google Drive no está conectado. Reconecta tu cuenta de Google con permiso de Drive en /settings/integrations/google.",
    )
    this.name = "DriveNotConnectedError"
  }
}

async function authHeader(studioId: string): Promise<string> {
  const token = await getDriveAccessToken(studioId)
  if (!token) throw new DriveNotConnectedError()
  return `Bearer ${token}`
}

function escapeQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

export interface DriveQuota {
  /** Bytes totales del plan. `null` = cuenta sin límite (Workspace ilimitado). */
  limit: number | null
  usage: number
  /** Bytes libres. `null` cuando no hay límite. */
  free: number | null
}

/**
 * Espacio del Drive de la cuenta conectada.
 *
 * Es el freno del respaldo automático: llenar el Drive no solo detiene los
 * respaldos, también deja al dueño sin poder recibir correo en esa cuenta de
 * Google. Antes de subir una galería se comprueba que quepa.
 */
export async function getStorageQuota(studioId: string): Promise<DriveQuota> {
  const auth = await authHeader(studioId)
  const res = await fetch(`${DRIVE_API}/about?fields=storageQuota`, {
    headers: { Authorization: auth },
  })
  if (!res.ok) throw new Error(`Drive quota ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    storageQuota?: { limit?: string; usage?: string }
  }
  // `limit` viene ausente en cuentas sin tope. Los valores son strings porque
  // superan el entero seguro de JavaScript.
  const limitRaw = data.storageQuota?.limit
  const limit = limitRaw == null ? null : Number(limitRaw)
  const usage = Number(data.storageQuota?.usage ?? 0)
  return {
    limit,
    usage,
    free: limit == null ? null : Math.max(0, limit - usage),
  }
}

/** Busca una carpeta por nombre dentro de `parentId` (o en la raíz). */
export async function findFolder(
  studioId: string,
  name: string,
  parentId: string | null,
): Promise<string | null> {
  const auth = await authHeader(studioId)
  const q = [
    `mimeType='${FOLDER_MIME}'`,
    "trashed=false",
    `name='${escapeQuery(name)}'`,
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ")
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1&spaces=drive`
  const res = await fetch(url, { headers: { Authorization: auth } })
  if (!res.ok) throw new Error(`Drive findFolder ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { files?: Array<{ id: string }> }
  return data.files?.[0]?.id ?? null
}

/** Crea una carpeta dentro de `parentId` (o en la raíz). */
export async function createFolder(
  studioId: string,
  name: string,
  parentId: string | null,
): Promise<string> {
  const auth = await authHeader(studioId)
  const body: Record<string, unknown> = { name, mimeType: FOLDER_MIME }
  if (parentId) body["parents"] = [parentId]
  const res = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Drive createFolder ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { id: string }
  return data.id
}

/** Busca-o-crea una carpeta (idempotente). */
export async function ensureFolder(
  studioId: string,
  name: string,
  parentId: string | null,
): Promise<string> {
  const found = await findFolder(studioId, name, parentId)
  if (found) return found
  return createFolder(studioId, name, parentId)
}

/** Busca-o-crea una cadena de carpetas y devuelve el id de la última. */
export async function ensureFolderPath(
  studioId: string,
  segments: string[],
): Promise<string> {
  let parent: string | null = null
  for (const seg of segments) {
    parent = await ensureFolder(studioId, seg, parent)
  }
  if (!parent) throw new Error("ensureFolderPath: ruta vacía")
  return parent
}

/**
 * Sube un archivo a una carpeta usando upload resumable (soporta archivos
 * grandes/originales). Para nuestros tamaños se sube en un solo PUT a la sesión.
 */
export async function uploadFile(
  studioId: string,
  folderId: string,
  name: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const auth = await authHeader(studioId)
  // 1) Iniciar sesión resumable.
  const initRes = await fetch(`${DRIVE_UPLOAD}?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(buffer.length),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  })
  if (!initRes.ok)
    throw new Error(`Drive upload init ${initRes.status}: ${await initRes.text()}`)
  const sessionUrl = initRes.headers.get("location")
  if (!sessionUrl) throw new Error("Drive: sin URL de sesión resumable")

  // 2) Subir bytes. (Uint8Array es BodyInit válido; Buffer no lo es en los tipos.)
  const putRes = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: new Uint8Array(buffer),
  })
  if (!putRes.ok) throw new Error(`Drive upload PUT ${putRes.status}: ${await putRes.text()}`)
  const data = (await putRes.json()) as { id: string }
  return data.id
}

/**
 * Archivos (no carpetas) dentro de una carpeta, del más nuevo al más viejo.
 * Con scope `drive.file` solo se ven los que creó la propia app — justo lo que
 * hace falta para rotar sus respaldos sin tocar nada más del Drive.
 */
export async function listFilesInFolder(
  studioId: string,
  folderId: string,
  pageSize = 100,
): Promise<Array<{ id: string; name: string; createdTime: string }>> {
  const auth = await authHeader(studioId)
  const q = [
    `'${folderId}' in parents`,
    "trashed=false",
    `mimeType!='${FOLDER_MIME}'`,
  ].join(" and ")
  const url =
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}` +
    `&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=${pageSize}&spaces=drive`
  const res = await fetch(url, { headers: { Authorization: auth } })
  if (!res.ok) throw new Error(`Drive listFiles ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    files?: Array<{ id: string; name: string; createdTime: string }>
  }
  return data.files ?? []
}

/**
 * Quita el acceso "cualquiera con el enlace" de una carpeta. Devuelve cuántos
 * permisos públicos retiró (0 = ya era privada).
 *
 * NO borra archivos ni toca los permisos de personas concretas: solo cierra el
 * enlace público.
 */
export async function revokePublicAccess(
  studioId: string,
  fileId: string,
): Promise<number> {
  const auth = await authHeader(studioId)
  const res = await fetch(
    `${DRIVE_API}/files/${fileId}/permissions?fields=permissions(id,type)`,
    { headers: { Authorization: auth } },
  )
  if (!res.ok) throw new Error(`Drive permissions ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    permissions?: Array<{ id: string; type: string }>
  }
  const publicos = (data.permissions ?? []).filter((p) => p.type === "anyone")

  let quitados = 0
  for (const p of publicos) {
    const del = await fetch(`${DRIVE_API}/files/${fileId}/permissions/${p.id}`, {
      method: "DELETE",
      headers: { Authorization: auth },
    })
    // 404 = ya no estaba; es el resultado buscado.
    if (del.ok || del.status === 404) quitados += 1
    else throw new Error(`Drive revoke ${del.status}: ${await del.text()}`)
  }
  return quitados
}

/**
 * Mueve un archivo de una carpeta a otra. En Drive "mover" es cambiar de padre:
 * el archivo NO se copia ni se borra, así que es reversible.
 */
export async function moveFile(
  studioId: string,
  fileId: string,
  fromFolderId: string,
  toFolderId: string,
): Promise<void> {
  const auth = await authHeader(studioId)
  const url =
    `${DRIVE_API}/files/${fileId}` +
    `?addParents=${encodeURIComponent(toFolderId)}` +
    `&removeParents=${encodeURIComponent(fromFolderId)}&fields=id`
  const res = await fetch(url, { method: "PATCH", headers: { Authorization: auth } })
  if (!res.ok) throw new Error(`Drive move ${res.status}: ${await res.text()}`)
}

/** Borra un archivo (se usa para rotar respaldos viejos). */
export async function deleteFile(studioId: string, fileId: string): Promise<void> {
  const auth = await authHeader(studioId)
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: auth },
  })
  // 404 = ya no está. Es el resultado buscado, no un fallo.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive delete ${res.status}: ${await res.text()}`)
  }
}

/**
 * Comparte una carpeta. Por email (lector) si hay email del cliente; si no,
 * por link no listado (anyone with link, sin descubrimiento). NUNCA público
 * indexable.
 */
export async function shareFolder(
  studioId: string,
  folderId: string,
  opts: { email?: string | null },
): Promise<void> {
  const auth = await authHeader(studioId)
  const body = opts.email
    ? { role: "reader", type: "user", emailAddress: opts.email }
    : { role: "reader", type: "anyone", allowFileDiscovery: false }
  const res = await fetch(
    `${DRIVE_API}/files/${folderId}/permissions?sendNotificationEmail=false&fields=id`,
    {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  )
  // 400 con "already shared" no es fatal.
  if (!res.ok) {
    const txt = await res.text()
    if (!/already|duplicate/i.test(txt)) {
      throw new Error(`Drive share ${res.status}: ${txt}`)
    }
  }
}

/** Devuelve el webViewLink (link compartible) de una carpeta/archivo. */
export async function getFileLink(
  studioId: string,
  fileId: string,
): Promise<string | null> {
  const auth = await authHeader(studioId)
  const res = await fetch(`${DRIVE_API}/files/${fileId}?fields=webViewLink`, {
    headers: { Authorization: auth },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { webViewLink?: string }
  return data.webViewLink ?? null
}
