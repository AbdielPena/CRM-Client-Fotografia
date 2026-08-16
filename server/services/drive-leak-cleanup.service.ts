import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import * as drive from "./google-drive.service"
import { driveFileNameFor } from "./gallery-drive.service"

/**
 * Limpieza de la fuga: sacar las fotos de SELECCIÓN de las carpetas de Drive
 * que están compartidas con el cliente.
 *
 * Cómo se produjo: la ruta de Drive se arma por PROYECTO, no por galería, así
 * que la selección y la entrega del mismo proyecto caían en la misma carpeta —
 * y esa carpeta se comparte por enlace para la entrega.
 *
 * Estado final que se busca:
 *   /PixelOS Entregas/…/{proyecto}/         → SOLO la entrega. Compartida.
 *   /PixelOS Respaldo interno/…/{proyecto}/ → la selección. Nunca compartida.
 *
 * Dos casos:
 *
 *  A) Carpeta con selección y SIN entrega → se le quita el enlace público. Los
 *     archivos no se tocan: pasan a ser respaldo interno, que es justo lo que
 *     el estudio quiere tener.
 *
 *  B) Carpeta MEZCLADA (selección + entrega) → se BORRAN de la carpeta del
 *     cliente los archivos que pertenecen ÚNICAMENTE a la selección. El
 *     enlace sigue vivo y la clienta no nota nada: sigue viendo su entrega.
 *
 * Una foto que está en las dos galerías (lo normal: la entrega es un subconjunto
 * de la selección) SE QUEDA. Borrarla le quitaría a la clienta una foto que sí
 * compró — es la regla que más importa de todo este archivo.
 *
 * Borrar aquí no pierde nada: las fotos siguen en el servidor, y el respaldo
 * interno las tiene en su propia carpeta, que no se comparte con nadie.
 */

export interface LeakCleanupResult {
  carpetasRevisadas: number
  enlacesQuitados: number
  archivosBorrados: number
  /** true = quedaron carpetas sin terminar; hay que volver a llamar. */
  quedaPendiente: boolean
  /** Fotos que están en selección Y entrega: se quedan con la clienta. */
  compartidasSeQuedan: number
  errores: number
  detalle: Array<{
    proyecto: string
    caso: "solo_seleccion" | "mezclada"
    accion: string
  }>
}

type Fila = {
  root_folder_id: string
  high_quality_folder_id: string | null
  social_folder_id: string | null
  gallery_id: string
  studio_id: string
  project_id: string | null
  gallery_type: string
  project_name: string | null
  gallery_name: string
}

/** Nombres de archivo en Drive de todas las fotos de una galería. */
async function nombresDe(galleryId: string): Promise<Set<string>> {
  const sb = untypedService()
  const out = new Set<string>()
  // Sin paginar se quedaría en 1000 y dejaríamos fotos sin clasificar — que en
  // esta limpieza significa mover a interno algo que la clienta sí compró.
  for (let desde = 0; ; desde += 1000) {
    const { data } = await sb
      .from("gallery_assets")
      .select("id, original_name, delivery_track")
      .eq("gallery_id", galleryId)
      .eq("status", "completed")
      .range(desde, desde + 999)
    const filas = (data ?? []) as Array<{
      id: string
      original_name: string | null
      delivery_track: "high_quality" | "social" | null
    }>
    for (const a of filas) {
      // Se registran los dos nombres posibles: no siempre se sabe con qué pista
      // se subió, y de más aquí solo significa "no la muevas".
      out.add(driveFileNameFor(a, "high_quality"))
      out.add(driveFileNameFor(a, "social"))
    }
    if (filas.length < 1000) break
  }
  return out
}

export async function runDriveLeakCleanup(
  opts: {
    dryRun?: boolean
    /**
     * Solo cerrar enlaces de las carpetas de SOLO selección, sin mover nada.
     * Es la parte urgente y de riesgo cero: ahí no hay ninguna entrega que
     * romper. Mover las mezcladas son decenas de miles de archivos y se hace
     * aparte, por tandas.
     */
    soloRevocar?: boolean
    /**
     * Tope de archivos a borrar en esta llamada. El proceso se corta a los 5
     * minutos, así que se avanza por tandas y se vuelve a llamar.
     */
    maxBorrar?: number
    /**
     * Limitar la limpieza a UNA carpeta de Drive (su `root_folder_id`). Sirve
     * para hacer la primera de verdad y que el estudio la revise con sus ojos
     * antes de soltar el resto.
     */
    soloCarpeta?: string
  } = {},
): Promise<LeakCleanupResult> {
  const sb = untypedService()
  const tope = opts.maxBorrar ?? 2000
  const res: LeakCleanupResult = {
    carpetasRevisadas: 0,
    enlacesQuitados: 0,
    archivosBorrados: 0,
    quedaPendiente: false,
    compartidasSeQuedan: 0,
    errores: 0,
    detalle: [],
  }

  const { data: raw } = await sb
    .from("gallery_drive_backups")
    .select(
      "root_folder_id, high_quality_folder_id, social_folder_id, gallery_id, studio_id, project_id, galleries!inner(gallery_type, name), projects(name)",
    )
    .not("root_folder_id", "is", null)

  // Agrupar por carpeta de Drive: es la unidad del problema.
  const porCarpeta = new Map<string, Fila[]>()
  for (const r of (raw ?? []) as Array<Record<string, unknown>>) {
    const g = (Array.isArray(r.galleries) ? r.galleries[0] : r.galleries) as
      | { gallery_type: string; name: string }
      | undefined
    const p = (Array.isArray(r.projects) ? r.projects[0] : r.projects) as
      | { name: string }
      | undefined
    if (!g) continue
    const fila: Fila = {
      root_folder_id: String(r.root_folder_id),
      high_quality_folder_id: (r.high_quality_folder_id as string) ?? null,
      social_folder_id: (r.social_folder_id as string) ?? null,
      gallery_id: String(r.gallery_id),
      studio_id: String(r.studio_id),
      project_id: (r.project_id as string) ?? null,
      gallery_type: g.gallery_type,
      project_name: p?.name ?? null,
      gallery_name: g.name,
    }
    const lista = porCarpeta.get(fila.root_folder_id) ?? []
    lista.push(fila)
    porCarpeta.set(fila.root_folder_id, lista)
  }

  for (const [carpetaId, filas] of porCarpeta) {
    if (opts.soloCarpeta && carpetaId !== opts.soloCarpeta) continue
    if (res.archivosBorrados >= tope) {
      res.quedaPendiente = true
      break
    }
    const seleccion = filas.filter((f) => f.gallery_type === "selection")
    if (seleccion.length === 0) continue // sin selección, nada que limpiar

    res.carpetasRevisadas += 1
    const entregas = filas.filter((f) => f.gallery_type === "final_delivery")
    const nombre = filas[0].project_name ?? filas[0].gallery_name
    const studioId = filas[0].studio_id

    try {
      // ── Caso A: solo selección → basta con cerrar el enlace ──────────────
      if (entregas.length === 0) {
        if (!opts.dryRun) {
          res.enlacesQuitados += await drive.revokePublicAccess(studioId, carpetaId)
        } else {
          res.enlacesQuitados += 1
        }
        res.detalle.push({
          proyecto: nombre,
          caso: "solo_seleccion",
          accion: "quitar enlace público (los archivos se quedan como respaldo interno)",
        })
        continue
      }

      // ── Caso B: mezclada → mover solo lo que es exclusivo de la selección ─
      if (opts.soloRevocar) continue

      const deEntrega = new Set<string>()
      for (const e of entregas) {
        for (const n of await nombresDe(e.gallery_id)) deEntrega.add(n)
      }
      const deSeleccion = new Set<string>()
      for (const s of seleccion) {
        for (const n of await nombresDe(s.gallery_id)) deSeleccion.add(n)
      }

      let borrados = 0
      let quedan = 0
      let cortado = false
      for (const sub of [
        filas[0].high_quality_folder_id,
        filas[0].social_folder_id,
      ]) {
        if (!sub) continue
        const archivos = await drive.listFilesInFolder(studioId, sub, 1000)
        for (const f of archivos) {
          // LA REGLA DE ORO: si la foto también es de la entrega, NO se toca.
          if (deEntrega.has(f.name)) {
            if (deSeleccion.has(f.name)) quedan += 1
            continue
          }
          if (!deSeleccion.has(f.name)) continue // ni de una ni de otra: no tocar
          if (res.archivosBorrados + borrados >= tope) {
            cortado = true
            break
          }
          if (!opts.dryRun) await drive.deleteFile(studioId, f.id)
          borrados += 1
        }
        if (cortado) break
      }

      res.archivosBorrados += borrados
      res.compartidasSeQuedan += quedan
      if (cortado) res.quedaPendiente = true
      res.detalle.push({
        proyecto: nombre,
        caso: "mezclada",
        accion:
          `borrar ${borrados} fotos de selección del enlace del cliente · ` +
          `${quedan} se quedan (también son de la entrega)` +
          (cortado ? " · TANDA CORTADA, quedan más" : ""),
      })
    } catch (err) {
      res.errores += 1
      console.error("[drive-leak] carpeta", carpetaId, err)
      res.detalle.push({
        proyecto: nombre,
        caso: entregas.length === 0 ? "solo_seleccion" : "mezclada",
        accion: `ERROR: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  return res
}
