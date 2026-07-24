import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import {
  recordCollaboratorPayable,
  recordCollaboratorPartialPayment,
} from "./finanzapp-bridge.service"

/**
 * Deuda con colaboradores: nace cuando la sesión YA PASÓ, no al asignar.
 *
 * Cambio pedido por Abdiel (2026-07-24). Antes `assignCollaborator` empujaba el
 * payable a FinanzApp en el momento de asignar, así que una sesión de
 * septiembre ya figuraba como deuda en julio. Ahora:
 *
 *   1. Al asignar NO se crea nada en FinanzApp (solo queda el acuerdo en el CRM).
 *   2. `runCollaboratorDebtSweep` corre a diario: por cada asignación cuya fecha
 *      ya pasó crea la cuenta por pagar en FinanzApp, sella `debt_registered_at`
 *      y avisa al colaborador por correo.
 *   3. El pago (total, parcial o manual) se registra desde el CRM con
 *      `registerAssignmentPayment`, que abona, espeja el gasto en FinanzApp y
 *      envía el recibo.
 *
 * FECHA DE CORTE (`studios.collab_debt_start_date`): las sesiones anteriores a
 * esa fecha NUNCA generan deuda automática — "las que ya pasaron no se suman;
 * de ahora en adelante solo las futuras".
 *
 * Idempotencia en todos los pasos:
 *   - `debt_registered_at` evita re-crear la deuda.
 *   - `pending_notified_at` evita reenviar el aviso.
 *   - `crm-collab:<assignmentId>` / `crm-collab-pay:<entryId>` tienen índice
 *     único en FinanzApp, así que un reintento no duplica dinero.
 */

const TZ = "America/Santo_Domingo"

/** Hoy en República Dominicana (YYYY-MM-DD). */
export function todayRD(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function money(n: number): string {
  return `RD$${Number(n || 0).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function dateLabel(dateOnly: string | null): string {
  if (!dateOnly) return "—"
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateOnly.slice(0, 10)}T00:00:00Z`))
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type SweepRow = {
  id: string
  studio_id: string
  agreed_pay: number | string
  paid_amount: number | string
  pay_status: string
  service_date: string | null
  role: string | null
  collaborator: { id: string; name: string; email: string | null } | null
  project: { id: string; name: string; event_date: string | null } | null
}

export type DebtSweepResult = {
  revisadas: number
  deudasCreadas: number
  correosEnviados: number
  omitidas: number
  detalle: Array<Record<string, unknown>>
}

/**
 * Envía el correo "trabajo realizado, esto es lo que se te debe".
 * Best-effort: nunca rompe el barrido.
 */
async function sendPendingEmail(
  studioId: string,
  row: SweepRow,
  fecha: string | null,
  pendiente: number,
): Promise<boolean> {
  const email = row.collaborator?.email
  if (!email) return false
  try {
    const { enqueueEmail } = await import("./email.service")
    const { resolveTemplate, TEMPLATE_CATALOG } = await import(
      "./email-template.service"
    )
    const d = TEMPLATE_CATALOG.collaborator_pending_payment
    const firstName = (row.collaborator?.name ?? "").trim().split(/\s+/)[0] || ""
    const tpl = await resolveTemplate(
      studioId,
      "collaborator_pending_payment",
      {
        collaborator_name: firstName || row.collaborator?.name || "",
        session_name: row.project?.name ?? "la sesión",
        service_date: dateLabel(fecha),
        agreed_amount: money(Number(row.agreed_pay ?? 0)),
        pending_amount: money(pendiente),
      },
      { subject: d.defaultSubject, bodyHtml: d.defaultBodyHtml },
    )
    await enqueueEmail({
      studioId,
      toEmail: email,
      toName: row.collaborator?.name ?? null,
      subject: tpl.subject,
      bodyHtml: tpl.bodyHtml,
      fromName: tpl.fromName,
      replyTo: tpl.replyTo,
      templateSlug: "collaborator_pending_payment",
      relatedEntityType: "project_collaborator",
      relatedEntityId: row.id,
    })
    return true
  } catch (e) {
    console.error(
      "[collab-debt] correo pendiente",
      e instanceof Error ? e.message : e,
    )
    return false
  }
}

/**
 * Barrido diario: registra la deuda de las sesiones que ya pasaron.
 *
 * @param opts.dryRun  no escribe nada; solo reporta qué haría.
 * @param opts.sendEmails  false = registra la deuda pero no avisa al colaborador.
 */
export async function runCollaboratorDebtSweep(
  opts: { dryRun?: boolean; sendEmails?: boolean } = {},
): Promise<DebtSweepResult> {
  const dryRun = opts.dryRun === true
  const sendEmails = opts.sendEmails !== false
  const sb = untypedService()
  const hoy = todayRD()

  // Fecha de corte por estudio (sin corte configurado => no se genera nada,
  // para no inventar deudas viejas por accidente).
  const { data: studiosData } = await sb
    .from("studios")
    .select("id, collab_debt_start_date")
    .is("deleted_at", null)
  const cortePorStudio = new Map<string, string | null>()
  for (const s of (studiosData ?? []) as Array<Record<string, unknown>>) {
    cortePorStudio.set(String(s.id), (s.collab_debt_start_date as string) ?? null)
  }

  const { data, error } = await sb
    .from("project_collaborators")
    .select(
      "id, studio_id, agreed_pay, paid_amount, pay_status, service_date, role, " +
        "collaborator:collaborators(id, name, email), " +
        "project:projects(id, name, event_date, deleted_at)",
    )
    .is("deleted_at", null)
    .is("debt_registered_at", null)
    .neq("pay_status", "cancelled")
    .gt("agreed_pay", 0)
  if (error) throwServiceError("COLLAB_DEBT_SWEEP_FAILED", error, {})

  const rows = (data ?? []) as unknown as Array<
    Omit<SweepRow, "collaborator" | "project"> & {
      collaborator: SweepRow["collaborator"] | SweepRow["collaborator"][]
      project: (SweepRow["project"] & { deleted_at?: string | null }) | null
    }
  >

  const out: DebtSweepResult = {
    revisadas: rows.length,
    deudasCreadas: 0,
    correosEnviados: 0,
    omitidas: 0,
    detalle: [],
  }

  for (const raw of rows) {
    const row: SweepRow = {
      ...raw,
      collaborator: one(raw.collaborator),
      project: one(raw.project),
    }
    const proyecto = raw.project as
      | (SweepRow["project"] & { deleted_at?: string | null })
      | null
    const fecha = row.service_date ?? proyecto?.event_date ?? null
    const corte = cortePorStudio.get(row.studio_id) ?? null
    const item: Record<string, unknown> = {
      colaborador: row.collaborator?.name ?? "?",
      sesion: proyecto?.name ?? "?",
      fecha,
      monto: Number(row.agreed_pay ?? 0),
    }

    // Filtros: sesión borrada, sin fecha, aún no ocurre, o anterior al corte.
    if (!proyecto || proyecto.deleted_at) {
      item.omitida = "sesión eliminada"
    } else if (!fecha) {
      item.omitida = "sin fecha de sesión"
    } else if (fecha >= hoy) {
      item.omitida = `la sesión aún no pasa (${fecha})`
    } else if (!corte) {
      item.omitida = "el estudio no tiene fecha de corte configurada"
    } else if (fecha < corte) {
      item.omitida = `anterior a la fecha de corte (${corte})`
    }

    if (item.omitida) {
      out.omitidas++
      out.detalle.push(item)
      continue
    }

    if (dryRun) {
      item.accion = "se registraría la deuda (dry-run)"
      out.detalle.push(item)
      continue
    }

    const agreed = Number(row.agreed_pay ?? 0)
    const paid = Number(row.paid_amount ?? 0)
    const pendiente = Math.max(0, agreed - paid)
    const acreedor = row.collaborator?.name ?? "Colaborador"

    // 1) Cuenta por pagar en FinanzApp (idempotente por crm-collab:<id>).
    try {
      await recordCollaboratorPayable(row.studio_id, {
        assignmentId: row.id,
        acreedor,
        monto: agreed,
        dueDate: fecha,
        notas: row.role
          ? `Colaborador: ${row.role} — ${proyecto?.name ?? ""}`
          : `Colaborador — ${proyecto?.name ?? ""}`,
      })
    } catch (e) {
      item.error = `FinanzApp: ${e instanceof Error ? e.message : "?"}`
      out.detalle.push(item)
      continue // sin deuda en Finanzas no sellamos: se reintenta mañana
    }

    // 2) Sellar en el CRM (a partir de aquí SÍ cuenta como pendiente).
    const patch: Record<string, unknown> = {
      debt_registered_at: new Date().toISOString(),
      finanzapp_payable_ref: `crm-collab:${row.id}`,
      updated_at: new Date().toISOString(),
    }

    // 3) Avisar al colaborador.
    let emailed = false
    if (sendEmails && pendiente > 0) {
      emailed = await sendPendingEmail(row.studio_id, row, fecha, pendiente)
      if (emailed) patch.pending_notified_at = new Date().toISOString()
    }

    await sb.from("project_collaborators").update(patch).eq("id", row.id)

    out.deudasCreadas++
    if (emailed) out.correosEnviados++
    item.resultado = emailed
      ? "deuda registrada + correo enviado"
      : "deuda registrada"
    out.detalle.push(item)

    try {
      await logActivity({
        studioId: row.studio_id,
        actorId: null,
        actorType: "system",
        entityType: "project_collaborator",
        entityId: row.id,
        action: "collaborator.debt_registered",
        metadata: { monto: agreed, fecha, emailed },
      })
    } catch {
      /* el historial no bloquea */
    }
  }

  return out
}

// ===========================================================================
// REGISTRO DE PAGOS (total / parcial / manual)
// ===========================================================================

export type RegisterPaymentInput = {
  assignmentId: string
  /** Monto del abono. Si no viene, se paga el saldo completo. */
  amount?: number | null
  method?: string | null
  /** Fecha del pago (YYYY-MM-DD). Default: hoy. */
  paidOn?: string | null
  note?: string | null
  /** Cuenta de FinanzApp de donde sale el dinero. */
  accountId?: string | null
  /** false = no enviar el recibo por correo. */
  sendReceipt?: boolean
}

export type RegisterPaymentResult = {
  ok: boolean
  entryId: string
  receiptNumber: string
  amount: number
  paidTotal: number
  pending: number
  payStatus: "partial" | "paid"
  finanzapp: boolean
  emailed: boolean
}

/** Siguiente número de recibo del estudio (basado en el MÁXIMO existente). */
async function nextReceiptNumber(studioId: string): Promise<string> {
  const sb = untypedService()
  const { data } = await sb
    .from("collaborator_payment_entries")
    .select("receipt_number")
    .eq("studio_id", studioId)
    .not("receipt_number", "is", null)
  let max = 0
  for (const r of (data ?? []) as Array<{ receipt_number: string | null }>) {
    const m = /(\d+)\s*$/.exec(r.receipt_number ?? "")
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `REC-${String(max + 1).padStart(6, "0")}`
}

/**
 * Registra un pago al colaborador por una sesión: total, parcial o manual.
 *
 * Orden deliberado: primero se guarda el abono en el CRM (fuente de verdad),
 * después se espeja en FinanzApp y al final se envía el recibo. Si FinanzApp
 * falla, el pago NO se pierde: queda registrado y el espejo se puede reintentar
 * (la referencia `crm-collab-pay:<entryId>` impide duplicarlo).
 */
export async function registerAssignmentPayment(
  studioId: string,
  actorId: string | null,
  input: RegisterPaymentInput,
): Promise<RegisterPaymentResult> {
  const sb = untypedService()

  const { data: found } = await sb
    .from("project_collaborators")
    .select(
      "id, studio_id, agreed_pay, paid_amount, pay_status, service_date, " +
        "debt_registered_at, collaborator:collaborators(id, name, email), " +
        "project:projects(id, name, event_date)",
    )
    .eq("id", input.assignmentId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!found) throw new Error("ASSIGNMENT_NOT_FOUND")

  const row = found as unknown as SweepRow & { debt_registered_at: string | null }
  const collaborator = one(row.collaborator)
  const project = one(row.project)

  const agreed = Number(row.agreed_pay ?? 0)
  const paidBefore = Number(row.paid_amount ?? 0)
  const pendingBefore = Math.max(0, agreed - paidBefore)
  if (pendingBefore <= 0) throw new Error("ASSIGNMENT_ALREADY_PAID")

  // Monto: el indicado, o el saldo completo. Nunca por encima del saldo.
  const raw = input.amount == null ? pendingBefore : Number(input.amount)
  if (!Number.isFinite(raw) || raw <= 0) throw new Error("INVALID_AMOUNT")
  const amount = Math.min(Math.round(raw * 100) / 100, pendingBefore)

  const paidOn = (input.paidOn || todayRD()).slice(0, 10)
  const receiptNumber = await nextReceiptNumber(studioId)

  // 1) Abono en el CRM
  const { data: entryRow, error: entryErr } = await sb
    .from("collaborator_payment_entries")
    .insert({
      studio_id: studioId,
      collaborator_id: collaborator?.id,
      project_collaborator_id: row.id,
      amount,
      method: input.method || null,
      paid_on: paidOn,
      note: input.note || null,
      receipt_number: receiptNumber,
      created_by: actorId,
    })
    .select("id")
    .single()
  if (entryErr)
    throwServiceError("COLLAB_PAYMENT_ENTRY_FAILED", entryErr, {
      studioId,
      assignmentId: input.assignmentId,
    })
  const entryId = String((entryRow as { id: string }).id)

  const paidTotal = Math.round((paidBefore + amount) * 100) / 100
  const pending = Math.max(0, Math.round((agreed - paidTotal) * 100) / 100)
  const payStatus: "partial" | "paid" = pending <= 0 ? "paid" : "partial"

  // 2) Acumulado y estado en la asignación.
  // OJO: `payment_method` solo se toca si el abono trae uno. Mandarlo siempre
  // borraría el método guardado cuando el pago no especifica ninguno.
  const assignmentPatch: Record<string, unknown> = {
    paid_amount: paidTotal,
    pay_status: payStatus,
    paid_at: payStatus === "paid" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }
  if (input.method) assignmentPatch.payment_method = input.method
  await sb
    .from("project_collaborators")
    .update(assignmentPatch)
    .eq("id", row.id)
    .eq("studio_id", studioId)

  // 3) Espejo en FinanzApp (gasto real + cerrar la cuenta si quedó saldada)
  let finanzapp = false
  try {
    // Si la deuda aún no se había registrado (pago adelantado), se crea ahora
    // para que el gasto tenga contra qué aplicarse.
    if (!row.debt_registered_at) {
      await recordCollaboratorPayable(studioId, {
        assignmentId: row.id,
        acreedor: collaborator?.name ?? "Colaborador",
        monto: agreed,
        dueDate: row.service_date ?? project?.event_date ?? null,
        notas: `Colaborador — ${project?.name ?? ""}`,
      })
      await sb
        .from("project_collaborators")
        .update({
          debt_registered_at: new Date().toISOString(),
          finanzapp_payable_ref: `crm-collab:${row.id}`,
        })
        .eq("id", row.id)
    }
    const r = await recordCollaboratorPartialPayment(studioId, {
      entryId,
      assignmentId: row.id,
      monto: amount,
      fecha: paidOn,
      accountId: input.accountId ?? null,
      descripcion: `Pago a colaborador: ${collaborator?.name ?? ""}${
        project?.name ? ` — ${project.name}` : ""
      }`,
      notas: `Recibo ${receiptNumber} · Registrado desde el CRM`,
      settle: payStatus === "paid",
    })
    finanzapp = r.ok === true
    if (finanzapp) {
      await sb
        .from("collaborator_payment_entries")
        .update({ finanzapp_tx_ref: `crm-collab-pay:${entryId}` })
        .eq("id", entryId)
    }
  } catch (e) {
    console.error(
      "[collab-pago→finanzapp]",
      e instanceof Error ? e.message : e,
    )
  }

  // 4) Recibo por correo
  let emailed = false
  if (input.sendReceipt !== false && collaborator?.email) {
    try {
      const { enqueueEmail } = await import("./email.service")
      const { resolveTemplate, TEMPLATE_CATALOG } = await import(
        "./email-template.service"
      )
      const d = TEMPLATE_CATALOG.collaborator_payment_receipt
      const firstName = (collaborator.name ?? "").trim().split(/\s+/)[0] || ""
      const tpl = await resolveTemplate(
        studioId,
        "collaborator_payment_receipt",
        {
          collaborator_name: firstName || collaborator.name || "",
          amount_paid: money(amount),
          session_name: project?.name ?? "la sesión",
          service_date: dateLabel(row.service_date ?? project?.event_date ?? null),
          receipt_number: receiptNumber,
          payment_date: dateLabel(paidOn),
          payment_method: input.method || "—",
          agreed_amount: money(agreed),
          balance_note:
            pending > 0
              ? `Queda un saldo pendiente de ${money(pending)}.`
              : "Con este pago tu trabajo queda saldado por completo.",
        },
        { subject: d.defaultSubject, bodyHtml: d.defaultBodyHtml },
      )
      await enqueueEmail({
        studioId,
        toEmail: collaborator.email,
        toName: collaborator.name,
        subject: tpl.subject,
        bodyHtml: tpl.bodyHtml,
        fromName: tpl.fromName,
        replyTo: tpl.replyTo,
        templateSlug: "collaborator_payment_receipt",
        relatedEntityType: "project_collaborator",
        relatedEntityId: row.id,
      })
      emailed = true
      await sb
        .from("collaborator_payment_entries")
        .update({ receipt_sent_at: new Date().toISOString() })
        .eq("id", entryId)
    } catch (e) {
      console.error("[collab-pago] recibo", e instanceof Error ? e.message : e)
    }
  }

  try {
    await logActivity({
      studioId,
      actorId,
      entityType: "project_collaborator",
      entityId: row.id,
      action: "collaborator.payment_registered",
      metadata: {
        entry_id: entryId,
        receipt_number: receiptNumber,
        amount,
        paid_total: paidTotal,
        pending,
        pay_status: payStatus,
        finanzapp,
        emailed,
      },
    })
  } catch {
    /* el historial no bloquea */
  }

  return {
    ok: true,
    entryId,
    receiptNumber,
    amount,
    paidTotal,
    pending,
    payStatus,
    finanzapp,
    emailed,
  }
}

export type CollaboratorJob = {
  id: string
  sessionName: string
  serviceDate: string | null
  agreedPay: number
  paidAmount: number
  pending: number
  payStatus: string
  /** true = la sesión ya pasó y la deuda está activa. */
  debtRegistered: boolean
  projectId: string
}

/**
 * Trabajos (sesiones) de un colaborador con su saldo, para la pantalla de
 * Colaboradores: es ahí donde Abdiel lleva el control de lo que le debe a cada
 * persona y desde donde registra los pagos.
 */
export async function listCollaboratorJobs(
  studioId: string,
  collaboratorId: string,
): Promise<CollaboratorJob[]> {
  const sb = untypedService()
  const { data } = await sb
    .from("project_collaborators")
    .select(
      "id, agreed_pay, paid_amount, pay_status, service_date, debt_registered_at, " +
        "project:projects(id, name, event_date, deleted_at)",
    )
    .eq("studio_id", studioId)
    .eq("collaborator_id", collaboratorId)
    .is("deleted_at", null)
    .gt("agreed_pay", 0)

  const rows = (data ?? []) as Array<Record<string, unknown>>
  return rows
    .map((r) => {
      const p = one(
        r.project as
          | { id: string; name: string; event_date: string | null; deleted_at: string | null }
          | Array<{
              id: string
              name: string
              event_date: string | null
              deleted_at: string | null
            }>
          | null,
      )
      const agreed = Number(r.agreed_pay ?? 0)
      const paid = Number(r.paid_amount ?? 0)
      return {
        id: String(r.id),
        sessionName: p?.name ?? "Sesión",
        serviceDate: (r.service_date as string) ?? p?.event_date ?? null,
        agreedPay: agreed,
        paidAmount: paid,
        pending: Math.max(0, agreed - paid),
        payStatus: String(r.pay_status ?? "pending"),
        debtRegistered: r.debt_registered_at != null,
        projectId: p?.id ?? "",
        _deleted: p?.deleted_at != null,
      }
    })
    .filter((j) => !j._deleted)
    .map(({ _deleted, ...j }) => {
      void _deleted
      return j
    })
    .sort((a, b) => (a.serviceDate ?? "").localeCompare(b.serviceDate ?? ""))
}

/** Abonos registrados de una asignación (para el detalle en el CRM). */
export async function listAssignmentPayments(
  studioId: string,
  assignmentId: string,
): Promise<
  Array<{
    id: string
    amount: number
    method: string | null
    paidOn: string
    note: string | null
    receiptNumber: string | null
    receiptSent: boolean
  }>
> {
  const sb = untypedService()
  const { data } = await sb
    .from("collaborator_payment_entries")
    .select("id, amount, method, paid_on, note, receipt_number, receipt_sent_at")
    .eq("studio_id", studioId)
    .eq("project_collaborator_id", assignmentId)
    .is("deleted_at", null)
    .order("paid_on", { ascending: false })
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    amount: Number(r.amount ?? 0),
    method: (r.method as string) ?? null,
    paidOn: String(r.paid_on ?? ""),
    note: (r.note as string) ?? null,
    receiptNumber: (r.receipt_number as string) ?? null,
    receiptSent: r.receipt_sent_at != null,
  }))
}
