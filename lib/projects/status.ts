// ============================================================================
// Detección de estados "terminales" de proyecto (Completado)
// ----------------------------------------------------------------------------
// Módulo framework-agnóstico (sin server-only): lo consumen el server component
// de /projects y los componentes cliente del board.
//
// Importante: a propósito NO trata "Entregado / Delivered" como terminal — en
// el flujo de Abby "Entregado" es un hito de entrega DENTRO del pipeline activo.
// El estado que saca al proyecto del tablero activo es el explícito "Completado"
// (y sinónimos de cierre: finalizado / terminado / cerrado / archivado / done).
// ============================================================================

const COMPLETED_LABELS = [
  "completado",
  "completada",
  "completed",
  "finalizado",
  "finalizada",
  "finalized",
  "terminado",
  "terminada",
  "cerrado",
  "cerrada",
  "closed",
  "archivado",
  "archivada",
  "archived",
  "done",
] as const

function normalizeLabel(label: string | null | undefined): string {
  if (!label) return ""
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

/** ¿Este label representa un proyecto COMPLETADO (terminal, fuera del board activo)? */
export function isCompletedProjectLabel(label: string | null | undefined): boolean {
  const norm = normalizeLabel(label)
  if (!norm) return false
  return (COMPLETED_LABELS as readonly string[]).includes(norm)
}

/** Label canónico que usamos para el estado terminal por defecto. */
export const DEFAULT_COMPLETED_LABEL = "Completado"
