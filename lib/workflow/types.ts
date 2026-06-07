/**
 * Tipos compartidos del pipeline de trabajo por cliente. Viven aquí (y no en
 * workflow.service.ts) para que componentes de cliente puedan importarlos sin
 * arrastrar el módulo `server-only`.
 */

export type StageKey =
  | "session"
  | "send_selection"
  | "editing"
  | "final_gallery"
  | "send_prints"
  | "finalized"

export type StageState = "done" | "current" | "todo" | "overdue"

export interface PipelineStage {
  key: StageKey
  label: string
  state: StageState
  date: string | null
  taskId: string | null
}

export interface ProjectPipeline {
  projectId: string
  projectName: string
  eventDate: string | null
  estimatedDeliveryDate: string | null
  stages: PipelineStage[]
  nextActionLabel: string | null
  overdueCount: number
}

export interface ClientCard {
  clientId: string
  clientName: string
  finalized: boolean
  earliestDelivery: string | null
  totalOverdue: number
  projects: ProjectPipeline[]
}

export const STAGE_LABELS: Record<StageKey, string> = {
  session: "Sesión",
  send_selection: "Enviar selección",
  editing: "Edición",
  final_gallery: "Galería final",
  send_prints: "Enviar impresiones",
  finalized: "Finalizado",
}

/** Orden canónico del flujo fotográfico. */
export const STAGE_ORDER: StageKey[] = [
  "session",
  "send_selection",
  "editing",
  "final_gallery",
  "send_prints",
  "finalized",
]
