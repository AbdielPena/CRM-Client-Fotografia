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
  /**
   * Estado personalizado de la sesión (`projects.status`): la ETIQUETA de un
   * `project_statuses` ("En edición", "Entregado"…), no un enum. Es un eje
   * distinto de `stages`: las etapas se derivan de los hechos (hay galería,
   * se envió la selección…), el estado lo mueve el estudio a mano o por
   * automatismo. El desplegable "Estado" del pipeline filtra por esto.
   */
  status: string | null
}

export interface ClientCard {
  clientId: string
  clientName: string
  finalized: boolean
  earliestDelivery: string | null
  totalOverdue: number
  projects: ProjectPipeline[]
  /**
   * Cuántas etapas lleva completadas el proyecto MÁS avanzado del cliente.
   * Ordena el pipeline: lo más cerca de terminar va primero.
   */
  progress: number
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
