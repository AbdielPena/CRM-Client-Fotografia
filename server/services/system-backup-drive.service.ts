import "server-only"

import { promises as fs } from "node:fs"
import path from "node:path"

import * as drive from "./google-drive.service"
import { getGoogleDriveStatus } from "./gallery-drive.service"

/**
 * Sube los volcados diarios de la base de datos a Google Drive.
 *
 * El cron del VPS ya hacía `pg_dump` todas las madrugadas, pero dejaba el
 * archivo en `/home/backups/sb-daily` — el MISMO disco que respalda. Si ese
 * servidor se pierde o lo comprometen, los respaldos se van con él. Eso es una
 * copia, no un respaldo.
 *
 * Reusa la conexión de Drive ya autorizada del estudio, así que no hace falta
 * configurar credenciales nuevas en el servidor.
 */

const CARPETA = "PixelOS Respaldos del sistema"
/** Cuántos volcados de cada base se conservan en Drive. */
const CONSERVAR = 14

export interface SystemBackupResult {
  subidos: string[]
  omitidos: string[]
  borrados: number
  bytes: number
  error?: string
}

/**
 * El volcado más reciente de cada base. Los nombres son `<base>-<fecha>.sql.gz`,
 * así que la base es todo lo que va antes del último guion.
 */
async function ultimosVolcados(dir: string): Promise<string[]> {
  const entradas = await fs.readdir(dir)
  const porBase = new Map<string, string>()
  for (const f of entradas.filter((f) => f.endsWith(".sql.gz")).sort()) {
    const base = f.slice(0, f.lastIndexOf("-"))
    // Orden alfabético = orden cronológico (fecha AAAAMMDD-HHMM), así que el
    // último que se ve de cada base es el más reciente.
    porBase.set(base, f)
  }
  return [...porBase.values()].map((f) => path.join(dir, f))
}

export async function uploadSystemBackupsToDrive(
  studioId: string,
  opts: { dir?: string; dryRun?: boolean } = {},
): Promise<SystemBackupResult> {
  const dir = opts.dir ?? process.env.SYSTEM_BACKUP_DIR ?? "/home/backups/sb-daily"
  const res: SystemBackupResult = { subidos: [], omitidos: [], borrados: 0, bytes: 0 }

  const estado = await getGoogleDriveStatus(studioId)
  if (!estado.connected) {
    res.error = "Google Drive no está conectado"
    return res
  }

  let archivos: string[]
  try {
    archivos = await ultimosVolcados(dir)
  } catch (err) {
    res.error = `No se pudo leer ${dir}: ${err instanceof Error ? err.message : err}`
    return res
  }
  if (archivos.length === 0) {
    res.error = `No hay volcados en ${dir}`
    return res
  }

  const carpetaId = await drive.ensureFolder(studioId, CARPETA, null)

  // Lo que ya está arriba, para no volver a subir el mismo volcado si el cron
  // corre dos veces el mismo día.
  const yaEnDrive = await drive.listFilesInFolder(studioId, carpetaId, 200)
  const nombresArriba = new Set(yaEnDrive.map((f) => f.name))

  for (const ruta of archivos) {
    const nombre = path.basename(ruta)
    if (nombresArriba.has(nombre)) {
      res.omitidos.push(nombre)
      continue
    }
    try {
      const datos = await fs.readFile(ruta)
      res.bytes += datos.length
      if (opts.dryRun) {
        res.subidos.push(nombre)
        continue
      }
      await drive.uploadFile(studioId, carpetaId, nombre, datos, "application/gzip")
      res.subidos.push(nombre)
    } catch (err) {
      console.error("[system-backup-drive] fallo subiendo", nombre, err)
      res.error = err instanceof Error ? err.message : String(err)
    }
  }

  // Rotación: conservar los N más recientes DE CADA BASE. Sin esto el Drive se
  // llena de volcados viejos y termina frenando el respaldo de las galerías.
  if (!opts.dryRun) {
    try {
      const actuales = await drive.listFilesInFolder(studioId, carpetaId, 500)
      const porBase = new Map<string, Array<{ id: string; name: string }>>()
      for (const f of actuales) {
        const base = f.name.slice(0, f.name.lastIndexOf("-"))
        const lista = porBase.get(base) ?? []
        lista.push(f)
        porBase.set(base, lista)
      }
      for (const lista of porBase.values()) {
        // `listFilesInFolder` ya viene del más nuevo al más viejo.
        for (const viejo of lista.slice(CONSERVAR)) {
          await drive.deleteFile(studioId, viejo.id)
          res.borrados += 1
        }
      }
    } catch (err) {
      console.error("[system-backup-drive] fallo en la rotación", err)
    }
  }

  return res
}
