import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { resolveRetentionMonths, retentionExpiryDate } from "@/lib/retention"
import { purgeGalleryStorageFiles } from "./gallery.service"
import { setProjectStatus } from "./project-status.service"
import { logActivity } from "./activity.service"
import { notify } from "./notification.service"

export const FINALIZADO_TOTAL_LABEL = "Finalizado total"

type SweepResult = {
  scanned: number
  purged: number
  skippedNoBackup: number
  notDue: number
  errors: number
  details: Array<{ project: string; action: string }>
}

/**
 * Barrido de retención de archivos. Por cada sesión ENTREGADA cuyo plazo de
 * conservación (desde `delivery_ready_at`) venció y que aún no se purgó:
 *   1. GATE de seguridad: exige respaldo Drive `completed` de la entrega. Si no
 *      hay, NO borra nada — notifica al dueño para respaldar. (Regla del dueño.)
 *   2. Borra los archivos LOCALES de TODAS las galerías de la sesión (selección
 *      + entrega): originales, miniaturas, web, web-clean y ZIPs. NO toca filas,
 *      NO toca Google Drive.
 *   3. Marca `files_purged_at` + `finalized_at` y pasa la sesión a "Finalizado
 *      total". Registra en el historial.
 *
 * `dryRun`: reporta qué haría, sin borrar ni cambiar nada. Para probar seguro.
 */
export async function runRetentionSweep(
  opts: { dryRun?: boolean; limit?: number } = {},
): Promise<SweepResult> {
  const dryRun = opts.dryRun ?? false
  const limit = opts.limit ?? 200
  const sb = untypedService()
  const now = new Date()

  const res: SweepResult = {
    scanned: 0,
    purged: 0,
    skippedNoBackup: 0,
    notDue: 0,
    errors: 0,
    details: [],
  }

  // Galerías de ENTREGA ya publicadas (delivery_ready_at) → su proyecto es
  // candidato. Traemos el proyecto y su categoría para resolver el plazo.
  const { data: galRows } = await sb
    .from("galleries")
    .select(
      `id, studio_id, project_id, delivery_ready_at,
       project:projects(id, name, retention_months, finalized_at, files_purged_at,
         service_category:service_categories(retention_months))`,
    )
    .not("delivery_ready_at", "is", null)
    .not("project_id", "is", null)
    .is("deleted_at", null)
    .limit(limit)

  const rows = (galRows ?? []) as Array<Record<string, unknown>>
  const pickOne = (v: unknown) => (Array.isArray(v) ? v[0] : v)

  // Dedup por proyecto (un proyecto puede tener varias galerías de entrega).
  const seenProjects = new Set<string>()

  for (const g of rows) {
    const project = pickOne(g.project) as Record<string, unknown> | null
    if (!project) continue
    const projectId = String(project.id)
    if (seenProjects.has(projectId)) continue
    seenProjects.add(projectId)
    res.scanned++

    // Ya purgado → nada que hacer.
    if (project.files_purged_at) continue

    const cat = pickOne(project.service_category) as { retention_months?: number | null } | null
    const months = resolveRetentionMonths(
      (project.retention_months as number | null) ?? null,
      cat?.retention_months ?? null,
    )
    const expiry = retentionExpiryDate(g.delivery_ready_at as string | null, months)
    if (!expiry || expiry > now) {
      res.notDue++
      continue
    }

    const studioId = String(g.studio_id)
    const projectName = String(project.name ?? "Sesión")

    // GATE R1: ¿hay respaldo Drive 'completed' de la entrega? Sin él, NO borrar.
    const { data: backupRows } = await sb
      .from("gallery_drive_backups")
      .select("status")
      .eq("gallery_id", g.id as string)
      .eq("status", "completed")
      .limit(1)
    const hasBackup = ((backupRows ?? []) as unknown[]).length > 0

    if (!hasBackup) {
      res.skippedNoBackup++
      res.details.push({ project: projectName, action: "saltada — sin respaldo Drive" })
      if (!dryRun) {
        await notify({
          studioId,
          type: "system",
          title: "Respalda en Drive para liberar espacio",
          body: `La sesión "${projectName}" venció su plazo de conservación pero NO tiene respaldo confirmado en Google Drive. No se borró nada. Respáldala para poder liberar el espacio.`,
          actionUrl: `/projects/${projectId}`,
          recipientRole: "owner",
        }).catch(() => {})
        await logActivity({
          studioId,
          action: "retention.skipped_no_backup",
          entityType: "project",
          entityId: projectId,
          actorType: "system",
          description: `Retención vencida sin respaldo Drive: no se borraron archivos de "${projectName}".`,
          elevated: true,
        }).catch(() => {})
      }
      continue
    }

    if (dryRun) {
      res.purged++
      res.details.push({ project: projectName, action: "SE BORRARÍA (respaldo OK)" })
      continue
    }

    // Purga los archivos de TODAS las galerías del proyecto (selección + entrega).
    try {
      const { data: projGalleries } = await sb
        .from("galleries")
        .select("id")
        .eq("project_id", projectId)
        .is("deleted_at", null)
      const galleryIds = ((projGalleries ?? []) as Array<{ id: string }>).map((x) => x.id)

      let removed = 0
      for (const gid of galleryIds) {
        const r = await purgeGalleryStorageFiles(studioId, gid)
        removed += r.removedOriginals + r.removedRenditions + r.removedZips
      }

      await sb
        .from("projects")
        .update({
          files_purged_at: now.toISOString(),
          finalized_at: (project.finalized_at as string | null) ?? now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", projectId)
        .eq("studio_id", studioId)

      await setProjectStatus(studioId, projectId, FINALIZADO_TOTAL_LABEL).catch(() => {})

      await logActivity({
        studioId,
        action: "retention.files_purged",
        entityType: "project",
        entityId: projectId,
        actorType: "system",
        description: `Finalizado total: se eliminaron ${removed} archivos locales de "${projectName}" (plazo ${months} meses). Google Drive intacto.`,
        metadata: { removedFiles: removed, months, driveIntact: true },
        elevated: true,
      }).catch(() => {})

      res.purged++
      res.details.push({ project: projectName, action: `purgada (${removed} archivos)` })
    } catch (err) {
      console.error("[retention-sweep] purge failed", projectId, err)
      res.errors++
      res.details.push({ project: projectName, action: "error" })
    }
  }

  return res
}
