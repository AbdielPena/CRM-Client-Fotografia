import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { getStorageQuota } from "./google-drive.service"
import {
  enqueueGalleryDriveBackup,
  getGoogleDriveStatus,
} from "./gallery-drive.service"

/**
 * Respaldo automático de TODAS las galerías a Google Drive.
 *
 * Hasta ahora el respaldo solo se encolaba al publicar una entrega final, así
 * que las galerías de SELECCIÓN —donde viven los originales de la sesión, lo
 * único verdaderamente irrecuperable— nunca se respaldaban. De 41 galerías con
 * fotos, 29 existían en un solo disco.
 *
 * Este barrido cierra ese hueco: busca cualquier galería con fotos que no tenga
 * respaldo completo (o a la que le entraron fotos nuevas desde el último) y la
 * encola. El trabajador que ya existía (`drainPendingDriveBackups`) las sube.
 *
 * Decisiones:
 *  - **Solo originales** (`track: "high_quality"`). Las versiones web se
 *    regeneran desde el original; respaldarlas cuesta el doble de espacio y no
 *    protege de nada.
 *  - **Se comprueba el espacio libre antes de encolar.** Llenar el Drive no
 *    solo detiene los respaldos: deja la cuenta de Google sin poder recibir
 *    correo.
 *  - **Por tandas.** Subir 28 GB de una vez satura la subida del servidor y
 *    choca con los límites de la API de Drive.
 */

/** Margen que NUNCA se toca, para que la cuenta de Google siga usable. */
const RESERVA_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB

export interface SweepResult {
  /** Galerías con fotos que deberían tener respaldo. */
  revisadas: number
  encoladas: number
  /** Ya respaldadas y sin fotos nuevas. */
  alDia: number
  /** No caben en el espacio libre de Drive. */
  sinEspacio: number
  yaEnCola: number
  errores: number
  espacioLibre: number | null
  bytesPorSubir: number
}

interface Candidata {
  id: string
  studioId: string
  nombre: string
  fotos: number
  bytes: number
}

/**
 * Galerías que necesitan respaldo: sin respaldo completo, o con más fotos que
 * las que tenía el último respaldo completo.
 */
async function candidatas(): Promise<Candidata[]> {
  const sb = untypedService()

  const { data: galRaw, error } = await sb
    .from("galleries")
    .select("id, studio_id, name")
    .is("deleted_at", null)
  if (error) throw error
  const galerias = (galRaw ?? []) as Array<{
    id: string
    studio_id: string
    name: string | null
  }>
  if (galerias.length === 0) return []

  // Último respaldo COMPLETO por galería (para saber cuántas fotos cubría).
  const { data: bkRaw } = await sb
    .from("gallery_drive_backups")
    .select("gallery_id, status, total_assets, completed_at")
    .in("status", ["completed", "pending", "running", "uploading"])
  const completos = new Map<string, number>()
  const enCurso = new Set<string>()
  for (const b of (bkRaw ?? []) as Array<{
    gallery_id: string
    status: string
    total_assets: number | null
  }>) {
    if (b.status === "completed") {
      // Si hubo varios, vale el que más fotos cubrió.
      const prev = completos.get(b.gallery_id) ?? 0
      completos.set(b.gallery_id, Math.max(prev, b.total_assets ?? 0))
    } else {
      enCurso.add(b.gallery_id)
    }
  }

  const out: Candidata[] = []
  for (const g of galerias) {
    if (enCurso.has(g.id)) continue // ya hay uno encolado o corriendo

    // Solo fotos listas: las que siguen procesándose no tienen original estable.
    const { data: assets } = await sb
      .from("gallery_assets")
      .select("file_size")
      .eq("gallery_id", g.id)
      .eq("status", "completed")
      .not("original_key", "is", null)
    const filas = (assets ?? []) as Array<{ file_size: number | null }>
    if (filas.length === 0) continue

    const yaCubiertas = completos.get(g.id)
    if (yaCubiertas != null && yaCubiertas >= filas.length) continue // al día

    out.push({
      id: g.id,
      studioId: g.studio_id,
      nombre: g.name ?? "Galería",
      fotos: filas.length,
      bytes: filas.reduce((s, a) => s + (Number(a.file_size) || 0), 0),
    })
  }
  // Las más pequeñas primero: así el respaldo avanza y protege más galerías
  // por noche en vez de atascarse subiendo una sola gigante.
  return out.sort((a, b) => a.bytes - b.bytes)
}

export async function runDriveBackupSweep(
  opts: { dryRun?: boolean; maxGalerias?: number } = {},
): Promise<SweepResult> {
  const max = opts.maxGalerias ?? 5
  const res: SweepResult = {
    revisadas: 0,
    encoladas: 0,
    alDia: 0,
    sinEspacio: 0,
    yaEnCola: 0,
    errores: 0,
    espacioLibre: null,
    bytesPorSubir: 0,
  }

  const pendientes = await candidatas()
  res.revisadas = pendientes.length
  if (pendientes.length === 0) return res

  // Cuota por estudio (normalmente uno solo, pero no se asume).
  const cuotaPorEstudio = new Map<string, number | null>()
  const libreRestante = new Map<string, number | null>()

  for (const g of pendientes) {
    if (res.encoladas >= max) break
    try {
      if (!cuotaPorEstudio.has(g.studioId)) {
        const estado = await getGoogleDriveStatus(g.studioId)
        if (!estado.connected) {
          cuotaPorEstudio.set(g.studioId, 0)
          libreRestante.set(g.studioId, 0)
        } else {
          const q = await getStorageQuota(g.studioId)
          const libre = q.free == null ? null : Math.max(0, q.free - RESERVA_BYTES)
          cuotaPorEstudio.set(g.studioId, libre)
          libreRestante.set(g.studioId, libre)
          if (res.espacioLibre == null || (libre != null && libre < res.espacioLibre)) {
            res.espacioLibre = libre
          }
        }
      }

      const libre = libreRestante.get(g.studioId)
      if (libre === 0) {
        res.sinEspacio += 1
        continue
      }
      if (libre != null && g.bytes > libre) {
        // No cabe. Se salta esta (puede que una más chica sí quepa).
        res.sinEspacio += 1
        continue
      }

      if (opts.dryRun) {
        res.encoladas += 1
        res.bytesPorSubir += g.bytes
        if (libre != null) libreRestante.set(g.studioId, libre - g.bytes)
        continue
      }

      // `track: high_quality` = solo originales. Ver la nota de arriba.
      await enqueueGalleryDriveBackup(g.studioId, g.id, { track: "high_quality" })
      res.encoladas += 1
      res.bytesPorSubir += g.bytes
      if (libre != null) libreRestante.set(g.studioId, libre - g.bytes)
    } catch (err) {
      res.errores += 1
      console.error("[drive-sweep] galería", g.id, err)
    }
  }

  return res
}

/** Resumen para la pantalla de ajustes: qué está protegido y qué no. */
export async function getDriveBackupOverview(studioId: string): Promise<{
  connected: boolean
  quota: { limit: number | null; usage: number; free: number | null } | null
  galeriasConFotos: number
  respaldadas: number
  pendientes: number
  fotosPendientes: number
  bytesPendientes: number
  ultimoRespaldo: string | null
}> {
  const sb = untypedService()
  const estado = await getGoogleDriveStatus(studioId)

  let quota: { limit: number | null; usage: number; free: number | null } | null = null
  if (estado.connected) {
    try {
      quota = await getStorageQuota(studioId)
    } catch (err) {
      console.error("[drive-sweep] no se pudo leer la cuota", err)
    }
  }

  const pendientes = (await candidatas()).filter((c) => c.studioId === studioId)

  const { count: conFotos } = await sb
    .from("galleries")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .is("deleted_at", null)

  const { data: ult } = await sb
    .from("gallery_drive_backups")
    .select("completed_at")
    .eq("studio_id", studioId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { count: respaldadas } = await sb
    .from("gallery_drive_backups")
    .select("gallery_id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .eq("status", "completed")

  return {
    connected: estado.connected,
    quota,
    galeriasConFotos: conFotos ?? 0,
    respaldadas: respaldadas ?? 0,
    pendientes: pendientes.length,
    fotosPendientes: pendientes.reduce((s, c) => s + c.fotos, 0),
    bytesPendientes: pendientes.reduce((s, c) => s + c.bytes, 0),
    ultimoRespaldo:
      (ult as { completed_at: string | null } | null)?.completed_at ?? null,
  }
}
