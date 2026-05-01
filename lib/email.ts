import { Resend } from "resend"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { createId } from "@paralleldrive/cuid2"

export const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder")

export const EMAIL_FROM =
  `${process.env.EMAIL_FROM_NAME ?? "StudioFlow"} <${process.env.EMAIL_FROM ?? "noreply@studioflow.app"}>`

// ─── Queue helper ─────────────────────────────────────────────────────────────

type EmailTemplate =
  | "gallery-share"
  | "invoice-sent"
  | "contract-sent"
  | "payment-received"
  | "gallery-reminder"
  | "invite-team"
  | "reset-password"

interface EnqueueEmailOptions {
  studioId: string
  to: string
  toName?: string
  subject: string
  template: EmailTemplate
  payload: Record<string, unknown>
  galleryId?: string
  invoiceId?: string
  contractId?: string
  projectId?: string
}

/**
 * Encola un correo en la tabla `email_queue` de Supabase.
 * Un Supabase Edge Function (send-email) consume la cola con polling.
 *
 * NOTA: La cola BullMQ fue reemplazada. Este helper ahora solo persiste
 * el registro en DB — el envío efectivo lo hace la Edge Function.
 */
export async function enqueueEmail(opts: EnqueueEmailOptions): Promise<string> {
  const logId = createId()
  const supabase = createSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("email_queue") as any).insert({
    id: logId,
    studio_id: opts.studioId,
    to_email: opts.to,
    to_name: opts.toName ?? null,
    subject: opts.subject,
    template: opts.template,
    payload: opts.payload,
    status: "pending",
    gallery_id: opts.galleryId ?? null,
    invoice_id: opts.invoiceId ?? null,
    contract_id: opts.contractId ?? null,
    project_id: opts.projectId ?? null,
  })

  if (error) {
    console.error("[enqueueEmail] failed", error)
    throw new Error(error.message)
  }

  return logId
}
