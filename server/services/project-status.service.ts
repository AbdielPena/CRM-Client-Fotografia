import 'server-only'

import { createSupabaseServerClient } from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'
import { throwServiceError } from '@/lib/utils/api-error'

export type ProjectStatus = {
  id: string
  studio_id: string
  label: string
  color: string
  position: number
  is_default: boolean
  created_at: string
  /** Intent del flujo automático asignado en Settings (null = solo keywords). */
  auto_intent: string | null
}

/** Lista todos los estados del studio ordenados por posición. */
export async function getProjectStatuses(studioId: string): Promise<ProjectStatus[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('project_statuses')
    .select('*')
    .eq('studio_id', studioId)
    .order('position', { ascending: true })

  if (error) throwServiceError("PROJECT_STATUS_OP_FAILED", error)
  return (data ?? []) as ProjectStatus[]
}

/** Crea un nuevo estado personalizado. */
export async function createProjectStatus(
  studioId: string,
  label: string,
  color: string,
): Promise<ProjectStatus> {
  const supabase = createSupabaseServerClient()

  // Posición = max actual + 1
  const { data: maxRow } = await supabase
    .from('project_statuses')
    .select('position')
    .eq('studio_id', studioId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = ((maxRow as { position: number } | null)?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('project_statuses')
    .insert({ studio_id: studioId, label, color, position })
    .select()
    .single()

  if (error) throwServiceError("PROJECT_STATUS_OP_FAILED", error)
  return data as ProjectStatus
}

/** Actualiza label, color y/o auto_intent de un estado. */
export async function updateProjectStatus(
  studioId: string,
  statusId: string,
  patch: { label?: string; color?: string; autoIntent?: string | null },
): Promise<void> {
  // Cast a any: los tipos generados aún no incluyen auto_intent (existe en DB).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createSupabaseServerClient() as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbPatch: Record<string, any> = {}
  if (patch.label !== undefined) dbPatch.label = patch.label
  if (patch.color !== undefined) dbPatch.color = patch.color
  if (patch.autoIntent !== undefined) {
    // Si se asigna un intent que ya tiene otro estado, liberarlo primero
    // (el índice único parcial lo exige).
    if (patch.autoIntent !== null) {
      await supabase
        .from('project_statuses')
        .update({ auto_intent: null })
        .eq('studio_id', studioId)
        .eq('auto_intent', patch.autoIntent)
        .neq('id', statusId)
    }
    dbPatch.auto_intent = patch.autoIntent
  }
  if (Object.keys(dbPatch).length === 0) return

  const { error } = await supabase
    .from('project_statuses')
    .update(dbPatch)
    .eq('id', statusId)
    .eq('studio_id', studioId)

  if (error) throwServiceError("PROJECT_STATUS_OP_FAILED", error)
}

/** Reordena los estados (recibe array de IDs en nuevo orden). */
export async function reorderProjectStatuses(
  studioId: string,
  orderedIds: string[],
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const updates = orderedIds.map((id, idx) =>
    supabase
      .from('project_statuses')
      .update({ position: idx })
      .eq('id', id)
      .eq('studio_id', studioId),
  )
  await Promise.all(updates)
}

/** Elimina un estado. Los proyectos con ese estado quedan con el label como texto. */
export async function deleteProjectStatus(
  studioId: string,
  statusId: string,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  // No se puede borrar si hay proyectos con ese status; primero verificamos
  const { data: status } = await supabase
    .from('project_statuses')
    .select('label')
    .eq('id', statusId)
    .eq('studio_id', studioId)
    .maybeSingle()

  if (!status) throw new Error('STATUS_NOT_FOUND')

  const label = (status as { label: string }).label
  const { count } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId)
    .eq('status', label)
    .is('deleted_at', null)

  if ((count ?? 0) > 0) {
    throw new Error(`Este estado tiene ${count} proyecto(s) activo(s). Muévelos primero.`)
  }

  const { error } = await supabase
    .from('project_statuses')
    .delete()
    .eq('id', statusId)
    .eq('studio_id', studioId)

  if (error) throwServiceError("PROJECT_STATUS_OP_FAILED", error)
}

/**
 * Cambia el estado de un proyecto (por label).
 *
 * Emite el evento de automatización `project.status_changed` (best-effort) solo
 * si el status realmente cambió. `opts.dispatch:false` lo suprime — lo usa la
 * acción de automatización `update_project_status` para no auto-dispararse en
 * bucle (una regla con trigger status_changed + acción update_project_status).
 *
 * `opts.elevated` escribe con permisos de servicio. Hace falta en los cambios
 * que dispara el CLIENTE sin sesión del CRM (aceptar una cotización desde su
 * teléfono): con el cliente normal la RLS descarta el UPDATE y —lo peor— NO
 * devuelve error, así que el flujo seguía como si hubiera funcionado y la
 * sesión se quedaba en el estado crudo 'booked', fuera del tablero.
 */
/**
 * ¿Esta etiqueta significa que el trabajo con el cliente ya terminó?
 *
 * Para Abdiel la última etapa es "Impresión enviada" (después de la entrega
 * digital vienen las impresiones). Se aceptan también los estados terminales
 * por si cierra la sesión sin pasar por impresiones.
 */
function normalizar(label: string | null | undefined): string {
  if (!label) return ""
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

/** Estados terminales: cierran la selección pase lo que pase. */
function esCierreTotal(label: string | null | undefined): boolean {
  const n = normalizar(label)
  return n === "completado" || n === "completada" || n === "finalizado total"
}

function esImpresionEnviada(label: string | null | undefined): boolean {
  const n = normalizar(label)
  return n.includes("impresion enviada") || n.includes("impresiones enviadas")
}

function esEntregado(label: string | null | undefined): boolean {
  const n = normalizar(label)
  return n === "entregado" || n === "entregada"
}

export async function setProjectStatus(
  studioId: string,
  projectId: string,
  newStatusLabel: string,
  opts?: { dispatch?: boolean; elevated?: boolean },
): Promise<void> {
  const supabase = opts?.elevated
    ? createSupabaseServiceClient()
    : createSupabaseServerClient()

  // Status previo para el payload from→to del evento.
  const { data: prev } = await supabase
    .from('projects')
    .select('status')
    .eq('id', projectId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .maybeSingle()
  const fromStatus = (prev as { status: string | null } | null)?.status ?? null

  const { data: updated, error } = await supabase
    .from('projects')
    .update({ status: newStatusLabel, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .select('id')

  if (error) throwServiceError("PROJECT_STATUS_OP_FAILED", error)
  // Un UPDATE que no toca ninguna fila NO devuelve error: así se perdió en
  // silencio el cambio de estado de las cotizaciones aceptadas por el cliente.
  // Que reviente aquí es lo correcto — quien llama ya lo registra.
  if (!updated || updated.length === 0) {
    throwServiceError(
      "PROJECT_STATUS_OP_FAILED",
      new Error(
        `el cambio de estado no afectó ninguna fila (proyecto ${projectId})`,
      ),
    )
  }

  const statusChanged = fromStatus !== newStatusLabel

  // Cuando la sesión pasa a un estado "entregado/completado", su entrega
  // (client_deliveries) se marca como realizada. Así, marcar la sesión como
  // entregada en el pipeline LIMPIA las alertas de "próximas entregas", que
  // hasta ahora vivían desconectadas del estado. Corre siempre (aunque
  // dispatch:false) porque es consistencia de datos, no un evento.
  if (statusChanged) {
    void (async () => {
      try {
        const { isCompletedStatusLabel } = await import('./engagement-feedback.service')
        if (!isCompletedStatusLabel(newStatusLabel) || isCompletedStatusLabel(fromStatus)) return
        const sb = createSupabaseServiceClient()
        await sb
          .from('client_deliveries')
          .update({
            status: 'entregada',
            delivered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('studio_id', studioId)
          .eq('project_id', projectId)
          .is('deleted_at', null)
          .neq('status', 'entregada')
      } catch (err) {
        console.error('[project-status] marcar entrega realizada falló', err)
      }
    })()
  }

  // La galería de SELECCIÓN se cierra cuando el proceso del cliente terminó.
  // Su última etapa es "Impresión enviada"; también cuenta darla por
  // completada/finalizada. La de ENTREGA no se toca (dura sus 6 meses).
  if (
    statusChanged &&
    (esCierreTotal(newStatusLabel) ||
      esImpresionEnviada(newStatusLabel) ||
      esEntregado(newStatusLabel))
  ) {
    void (async () => {
      try {
        const { closeSelectionGalleries, getSelectionCloseTrigger } =
          await import("./gallery.service")
        // Lo decide el PLAN de la sesión; los estados terminales cierran igual.
        if (!esCierreTotal(newStatusLabel)) {
          const trigger = await getSelectionCloseTrigger(studioId, projectId)
          if (trigger === "never") return
          if (trigger === "prints_sent" && !esImpresionEnviada(newStatusLabel))
            return
          if (
            trigger === "delivered" &&
            !esEntregado(newStatusLabel) &&
            !esImpresionEnviada(newStatusLabel)
          )
            return
        }
        const cerradas = await closeSelectionGalleries(studioId, projectId)
        if (cerradas > 0) {
          console.info(
            `[project-status] ${cerradas} galería(s) de selección cerradas (${projectId})`,
          )
        }
      } catch (err) {
        console.error("[project-status] cerrar selección falló", err)
      }
    })()
  }

  if (opts?.dispatch !== false && statusChanged) {
    void (async () => {
      try {
        const { dispatchAutomationEvent } = await import('./automation.service')
        await dispatchAutomationEvent({
          studioId,
          event: 'project.status_changed',
          entityType: 'project',
          entityId: projectId,
          payload: { project_id: projectId, from: fromStatus, to: newStatusLabel },
        })
      } catch (err) {
        console.error('[project-status] dispatch project.status_changed failed', err)
      }
    })()

    // Si el nuevo status indica "proyecto completado" (label normalizado),
    // dispara el email de solicitud de reseña al cliente. Fire-and-forget.
    void (async () => {
      try {
        const { isCompletedStatusLabel, sendReviewRequestEmail } = await import(
          './engagement-feedback.service'
        )
        if (!isCompletedStatusLabel(newStatusLabel)) return
        if (isCompletedStatusLabel(fromStatus)) return // ya estaba completado

        const sb = createSupabaseServiceClient()
        const { data: row } = await sb
          .from('projects')
          .select('client_id')
          .eq('id', projectId)
          .eq('studio_id', studioId)
          .maybeSingle()
        const clientId = (row as { client_id: string | null } | null)?.client_id
        if (!clientId) return
        await sendReviewRequestEmail(studioId, clientId, projectId)
      } catch (err) {
        console.error('[project-status] sendReviewRequestEmail failed', err)
      }
    })()
  }
}
