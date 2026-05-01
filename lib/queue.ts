import { Queue } from "bullmq"
import { redis } from "./redis"

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
}

export const queues = {
  imageProcessing: new Queue("image-processing", {
    connection: redis,
    defaultJobOptions,
  }),
  zipGeneration: new Queue("zip-generation", {
    connection: redis,
    defaultJobOptions,
  }),
  emailSending: new Queue("email-sending", {
    connection: redis,
    defaultJobOptions: { ...defaultJobOptions, attempts: 5 },
  }),
  pdfGeneration: new Queue("pdf-generation", {
    connection: redis,
    defaultJobOptions,
  }),
  workflowExec: new Queue("workflow-exec", {
    connection: redis,
    defaultJobOptions,
  }),
}

// Tipos de payload
export type ImageProcessingPayload = {
  assetId: string
  studioId: string
  galleryId: string
  storageKey: string
  applyWatermark: boolean
  watermarkText?: string
  watermarkStorageKey?: string
  watermarkOpacity?: number
  watermarkPosition?: string
}

export type EmailSendingPayload = {
  to: string
  toName?: string
  subject: string
  /** Pre-rendered HTML — use when you build HTML yourself */
  html?: string
  /** React Email template name — used by the worker to render */
  template?:
    | "gallery-share"
    | "invoice-sent"
    | "contract-sent"
    | "payment-received"
    | "gallery-reminder"
    | "invite-team"
    | "reset-password"
  /** Props to pass to the React Email template */
  templatePayload?: Record<string, unknown>
  /** Legacy: raw variables for basic string interpolation */
  variables?: Record<string, string>
  /** EmailLog record ID for status tracking */
  logId?: string
  studioId: string
  projectId?: string
  galleryId?: string
  invoiceId?: string
  contractId?: string
}

export type PdfGenerationPayload = {
  type: "CONTRACT" | "INVOICE"
  entityId: string
  studioId: string
}

export type ZipGenerationPayload = {
  downloadId: string
  studioId: string
  galleryId: string
  collectionId?: string
  resolution: "WEB" | "HIGH" | "ORIGINAL"
  assetIds: string[]
}
