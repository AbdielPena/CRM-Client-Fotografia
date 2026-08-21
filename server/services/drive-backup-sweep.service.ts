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

/**
 * Veces que se reintenta una galería que nunca llega a completar. Sin tope, una
 * galería con un problema permanente se reencola en cada barrido eternamente.
 */
const MAX_INTENTOS = 4

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

  // A Drive sube SOLO lo que el estudio pone en la galería de ENTREGA FINAL.
  //
  // La selección del cliente NO se sube: son las pruebas de la sesión, viven en
  // el servidor y ahí se quedan. Subirlas fue lo que llenó las carpetas de las
  // clientas con la sesión completa.
  const { data: galRaw, error } = await sb
    .from("galleries")
    .select("id, studio_id, name")
    .eq("gallery_type", "final_delivery")
    .is("deleted_at", null)
  if (error) throw error
  const galerias = (galRaw ?? []) as Array<{
    id: string
    studio_id: string
    name: string | null
  }>
  if (galerias.length === 0) return []

  // TODOS los respaldos por galería: hace falta saber no solo cuál completó,
  // sino cuántas veces se ha intentado.
  const { data: bkRaw } = await sb
    .from("gallery_drive_backups")
    .select("gallery_id, status, total_assets")
  const completos = new Map<string, number>()
  const enCurso = new Set<string>()
  const intentos = new Map<string, number>()
  for (const b of (bkRaw ?? []) as Array<{
    gallery_id: string
    status: string
    total_assets: number | null
  }>) {
    intentos.set(b.gallery_id, (intentos.get(b.gallery_id) ?? 0) + 1)
    if (b.status === "completed") {
      // Si hubo varios, vale el que más fotos cubrió.
      const prev = completos.get(b.gallery_id) ?? 0
      completos.set(b.gallery_id, Math.max(prev, b.total_assets ?? 0))
    } else if (["pending", "running", "uploading"].includes(b.status)) {
      enCurso.add(b.gallery_id)
    }
  }

  const out: Candidata[] = []
  for (const g of galerias) {
    if (enCurso.has(g.id)) continue // ya hay uno encolado o corriendo

    // Tope de reintentos. Una galería que falla o queda a medias una y otra vez
    // (fotos rotas, permisos, lo que sea) se reencolaba en CADA barrido, para
    // siempre. Tras varios intentos se deja quieta: que se vea como un problema
    // a resolver, no como un bucle silencioso.
    //
    // El tope vale TAMBIÉN para las que llegaron a completarse. Antes esas
    // quedaban exentas, y ahí estaba el bucle: una entrega con fotos duplicadas
    // que ya no tienen archivo en el servidor (Mia XV tiene 82 filas para 43
    // fotas reales) nunca puede cubrirlas todas, así que se daba por incompleta
    // y volvía a la cola cada 5 minutos. Yudelka llegó a 676 respaldos.
    if ((intentos.get(g.id) ?? 0) >= MAX_INTENTOS) continue

    // Solo fotos listas: las que siguen procesándose no tienen original estable.
    //
    // Y SOLO las de "Máxima calidad", que son las que este barrido sube. Contar
    // también las de "Redes" era un bucle infinito: la galería de Yudelka tiene
    // las mismas 10 fotos en las dos pistas (20 filas), el respaldo cubría 10,
    // y al comparar 10 contra 20 nunca se daba por completa. Se reencolaba cada
    // 5 minutos — 676 veces — bajando y subiendo las mismas 10 fotos.
    const { data: assets } = await sb
      .from("gallery_assets")
      .select("file_size")
      .eq("gallery_id", g.id)
      .eq("status", "completed")
      .eq("delivery_track", "high_quality")
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
      //
      // `notifyClient: false` es lo importante aquí: esto es una COPIA DE
      // SEGURIDAD, no una entrega. La primera versión de este barrido usaba el
      // valor por defecto (avisar) y le mandó 95 correos en un día a una
      // clienta cuyo respaldo se reintentaba.
      await enqueueGalleryDriveBackup(g.studioId, g.id, {
        track: "high_quality",
        notifyClient: false,
      })
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
