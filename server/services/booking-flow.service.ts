import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"

/**
 * Estado completo del flujo de confirmación del cliente, resuelto desde el
 * signing_token del contrato. Alimenta la página hub `/b/[token]`.
 *
 * El flujo del cliente tras la aprobación:
 *   1. Revisa el plan
 *   2. Completa el formulario (si el paquete tiene uno asignado)
 *   3. Firma el contrato
 *   4. Ve la factura y paga (la factura se genera al firmar)
 */

export type BookingFlowStep = "form" | "sign" | "pay" | "done"

export interface BookingFlowForm {
  accessToken: string
  status: string // pending | completed | expired
  templateName: string | null
}

export interface BookingFlowInvoice {
  id: string
  status: string
  total: number
  amountPaid: number
  currency: string
}

export interface BookingFlowState {
  signingToken: string
  contractId: string
  contractStatus: string
  contractSigned: boolean
  expired: boolean
  studio: { name: string; logoUrl: string | null; primaryColor: string }
  client: { name: string; email: string | null }
  plan: {
    packageName: string
    eventType: string | null
    eventDate: string | null
    total: number
    currency: string
    includes: string[]
  }
  forms: BookingFlowForm[]
  formsPending: number
  invoice: BookingFlowInvoice | null
  /** Paso en el que debe actuar el cliente ahora. */
  currentStep: BookingFlowStep
}

function asArray<T>(v: unknown): T[] {
  if (!v) return []
  if (Array.isArray(v)) return v as T[]
  return [v as T]
}

export async function getClientBookingFlow(
  signingToken: string,
): Promise<BookingFlowState | null> {
  const supabase = createSupabaseServiceClient()

  // 1. Contrato por signing_token
  const { data: contractRow } = await supabase
    .from("contracts")
    .select(
      `id, status, signed_at, expires_at, studio_id, project_id, booking_request_id, signing_token`,
    )
    .eq("signing_token", signingToken)
    .is("deleted_at", null)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contract = contractRow as any
  if (!contract) return null

  const projectId = contract.project_id as string | null
  const bookingRequestId = contract.booking_request_id as string | null
  const studioId = contract.studio_id as string

  // 2. Proyecto + paquete + cliente
  let plan: BookingFlowState["plan"] = {
    packageName: "Tu paquete",
    eventType: null,
    eventDate: null,
    total: 0,
    currency: "DOP",
    includes: [],
  }
  let client: BookingFlowState["client"] = { name: "Cliente", email: null }

  if (projectId) {
    const { data: projRow } = await supabase
      .from("projects")
      .select(
        `name, event_type, event_date, total_amount, currency, client_id,
         package:packages ( name, price, currency, includes ),
         client:clients ( name, email )`,
      )
      .eq("id", projectId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proj = projRow as any
    if (proj) {
      const pkg = asArray<{
        name?: string
        price?: number
        currency?: string
        includes?: string[]
      }>(proj.package)[0]
      const cli = asArray<{ name?: string; email?: string | null }>(
        proj.client,
      )[0]
      plan = {
        packageName: pkg?.name ?? proj.name ?? "Tu paquete",
        eventType: proj.event_type ?? null,
        eventDate: proj.event_date ?? null,
        total: Number(proj.total_amount ?? pkg?.price ?? 0),
        currency: proj.currency ?? pkg?.currency ?? "DOP",
        includes: Array.isArray(pkg?.includes) ? (pkg!.includes as string[]) : [],
      }
      if (cli) client = { name: cli.name ?? "Cliente", email: cli.email ?? null }
    }
  }

  // 3. Studio branding
  const { data: studioRow } = await supabase
    .from("studios")
    .select("name, logo_url, primary_color")
    .eq("id", studioId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = studioRow as any
  const studio = {
    name: s?.name ?? "Studio",
    logoUrl: s?.logo_url ?? null,
    primaryColor: s?.primary_color ?? "#7C3AED",
  }

  // 4. Formularios del booking/proyecto
  const forms: BookingFlowForm[] = []
  {
    const orFilter = bookingRequestId
      ? `project_id.eq.${projectId},booking_request_id.eq.${bookingRequestId}`
      : `project_id.eq.${projectId}`
    const { data: formRows } = await supabase
      .from("form_responses")
      .select(
        `access_token, status, form_template:form_templates ( name )`,
      )
      .or(projectId ? orFilter : `booking_request_id.eq.${bookingRequestId}`)
      .eq("studio_id", studioId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (formRows as any[]) ?? []) {
      const tmpl = asArray<{ name?: string }>(r.form_template)[0]
      forms.push({
        accessToken: r.access_token,
        status: r.status,
        templateName: tmpl?.name ?? null,
      })
    }
  }
  const formsPending = forms.filter(
    (f) => f.status !== "completed" && f.status !== "expired",
  ).length

  // 5. Factura del proyecto (la única del flujo nuevo; la más reciente)
  let invoice: BookingFlowInvoice | null = null
  if (projectId) {
    const { data: invRow } = await supabase
      .from("invoices")
      .select("id, status, total, amount_paid, currency")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = invRow as any
    if (inv) {
      invoice = {
        id: inv.id,
        status: inv.status,
        total: Number(inv.total ?? 0),
        amountPaid: Number(inv.amount_paid ?? 0),
        currency: inv.currency ?? plan.currency,
      }
    }
  }

  const contractStatus = contract.status as string
  const contractSigned = !!contract.signed_at || contractStatus === "signed"
  const expiresAt = contract.expires_at as string | null
  const expired =
    contractStatus === "voided" ||
    contractStatus === "cancelled" ||
    contractStatus === "expired" ||
    (!!expiresAt && new Date() > new Date(expiresAt))

  // Determinar el paso actual
  let currentStep: BookingFlowStep
  if (formsPending > 0) {
    currentStep = "form"
  } else if (!contractSigned) {
    currentStep = "sign"
  } else if (invoice && invoice.status !== "paid") {
    currentStep = "pay"
  } else {
    currentStep = "done"
  }

  return {
    signingToken,
    contractId: contract.id,
    contractStatus,
    contractSigned,
    expired,
    studio,
    client,
    plan,
    forms,
    formsPending,
    invoice,
    currentStep,
  }
}
