import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "@/server/services/activity.service"

/**
 * Modificar un contrato ya enviado o firmado.
 *
 * Por qué existe: un contrato firmado no se puede "editar y ya". La firma del
 * cliente vale por lo que decía ESE día. Si el estudio necesita cambiar algo
 * —típicamente corregir el monto— hay que hacer tres cosas, en este orden:
 *
 *   1. Archivar la firma anterior (queda como prueba de lo que aceptó).
 *   2. Dejar el contrato pendiente otra vez, con el MISMO enlace de firma.
 *   3. Avisarle al cliente QUÉ cambió, no solo que "hubo un cambio".
 *
 * El enlace no cambia a propósito: el cliente ya lo tiene guardado y volver a
 * mandarle una dirección distinta es la forma más fácil de perderlo.
 */

export interface AmendChange {
  campo: string
  antes: string
  despues: string
}

export interface AmendContractInput {
  studioId: string
  contractId: string
  actorId: string | null
  /** Lo que se le explica al cliente. Obligatorio: sin motivo no se avisa bien. */
  summary: string
  /** Monto total nuevo de la sesión. `null` = no tocar el dinero. */
  newTotal?: number | null
  /** Avisar al cliente por correo (por defecto sí). */
  notifyClient?: boolean
}

export interface AmendContractResult {
  ok: boolean
  version: number
  changes: AmendChange[]
  clientNotified: boolean
  /** Enlace de firma (el mismo de siempre). */
  signUrl: string | null
  error?: string
}

const money = (n: number, currency = "DOP") =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency }).format(n)

/**
 * Reparte un total nuevo entre las facturas de la sesión.
 *
 * Regla: lo que YA se cobró no se toca — esas facturas son historia contable.
 * El ajuste cae sobre las facturas sin pagos. Si todo está cobrado, no se puede
 * cambiar el monto desde aquí (haría falta una nota de crédito, que es otra
 * conversación).
 */
async function ajustarMontos(
  studioId: string,
  projectId: string,
  nuevoTotal: number,
): Promise<{ ok: boolean; error?: string; antes: number; currency: string }> {
  const sb = untypedService()
  const { data: invRaw } = await sb
    .from("invoices")
    .select("id, total, amount_paid, status, currency, kind, installment_number")
    .eq("studio_id", studioId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
  const facturas = (invRaw ?? []) as Array<{
    id: string
    total: number | string
    amount_paid: number | string
    status: string
    currency: string | null
    kind: string | null
    installment_number: number | null
  }>

  const currency = facturas[0]?.currency ?? "DOP"
  const antes = facturas.reduce((s, i) => s + Number(i.total ?? 0), 0)
  if (facturas.length === 0) return { ok: true, antes: 0, currency }

  const cobrado = facturas.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0)
  if (nuevoTotal < cobrado) {
    return {
      ok: false,
      antes,
      currency,
      error: `Ya cobraste ${money(cobrado, currency)}. El total nuevo no puede ser menor.`,
    }
  }

  const tocables = facturas.filter((i) => Number(i.amount_paid ?? 0) === 0)
  const intocables = facturas.filter((i) => Number(i.amount_paid ?? 0) > 0)
  if (tocables.length === 0) {
    return {
      ok: false,
      antes,
      currency,
      error:
        "Todas las facturas de esta sesión ya tienen pagos. Ajusta el monto a mano o emite una nota de crédito.",
    }
  }

  const fijo = intocables.reduce((s, i) => s + Number(i.total ?? 0), 0)
  const repartir = nuevoTotal - fijo
  if (repartir < 0) {
    return {
      ok: false,
      antes,
      currency,
      error: `Las facturas con pagos ya suman ${money(fijo, currency)}, más que el total nuevo.`,
    }
  }

  // Se reparte proporcional a lo que cada factura pendiente pesaba antes; si
  // todas estaban en cero (raro), se divide en partes iguales.
  const pesoTotal = tocables.reduce((s, i) => s + Number(i.total ?? 0), 0)
  const now = new Date().toISOString()
  let asignado = 0

  for (let idx = 0; idx < tocables.length; idx++) {
    const inv = tocables[idx]
    const ultima = idx === tocables.length - 1
    const parte = ultima
      ? repartir - asignado // el redondeo cae en la última, nunca se pierde un peso
      : Number(
          (pesoTotal > 0
            ? (repartir * Number(inv.total ?? 0)) / pesoTotal
            : repartir / tocables.length
          ).toFixed(2),
        )
    asignado += parte

    await sb
      .from("invoices")
      .update({
        subtotal: parte,
        total: parte,
        balance_due: parte,
        updated_at: now,
      })
      .eq("id", inv.id)
      .eq("studio_id", studioId)

    // Las líneas del documento tienen que decir lo mismo que el total.
    const { data: itemsRaw } = await sb
      .from("invoice_items")
      .select("id")
      .eq("invoice_id", inv.id)
    const items = (itemsRaw ?? []) as Array<{ id: string }>
    if (items.length === 1) {
      await sb
        .from("invoice_items")
        .update({ unit_price: parte, total: parte })
        .eq("id", items[0].id)
    }

    // Espejo a la app de Facturación (best-effort: nunca bloquea).
    try {
      const { mirrorInvoiceToFacturacion } = await import(
        "./facturacion-bridge.service"
      )
      await mirrorInvoiceToFacturacion(studioId, inv.id)
    } catch (err) {
      console.error("[amendContract] espejo de factura falló", err)
    }
  }

  return { ok: true, antes, currency }
}

export async function amendContract(
  input: AmendContractInput,
): Promise<AmendContractResult> {
  const { studioId, contractId, actorId } = input
  const summary = input.summary.trim()
  if (!summary) {
    return {
      ok: false,
      version: 0,
      changes: [],
      clientNotified: false,
      signUrl: null,
      error: "Escribe qué cambió: es lo que va a leer el cliente.",
    }
  }

  const sb = untypedService()
  const svc = createSupabaseServiceClient()

  const { data: cRaw } = await sb
    .from("contracts")
    .select(
      "id, studio_id, project_id, title, status, signing_token, signed_at, " +
        "signed_name, signed_email, signed_ip, signature_image_url, " +
        "evidence_hash, body_snapshot",
    )
    .eq("id", contractId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  const contrato = cRaw as {
    id: string
    project_id: string | null
    title: string | null
    status: string
    signing_token: string | null
    signed_at: string | null
    signed_name: string | null
    signed_email: string | null
    signed_ip: string | null
    signature_image_url: string | null
    evidence_hash: string | null
    body_snapshot: string | null
  } | null
  if (!contrato) throwServiceError("CONTRACT_NOT_FOUND", new Error(contractId))
  if (["voided", "cancelled"].includes(contrato.status)) {
    return {
      ok: false,
      version: 0,
      changes: [],
      clientNotified: false,
      signUrl: null,
      error: "Este contrato está anulado. Crea uno nuevo.",
    }
  }

  const changes: AmendChange[] = []

  // ── 1. El dinero, si toca ────────────────────────────────────────────────
  if (input.newTotal != null && contrato.project_id) {
    const r = await ajustarMontos(studioId, contrato.project_id, input.newTotal)
    if (!r.ok) {
      return {
        ok: false,
        version: 0,
        changes: [],
        clientNotified: false,
        signUrl: null,
        error: r.error,
      }
    }
    if (r.antes !== input.newTotal) {
      changes.push({
        campo: "Monto total de los servicios",
        antes: money(r.antes, r.currency),
        despues: money(input.newTotal, r.currency),
      })
    }
    // La sesión y la reserva tienen que contar lo mismo que la factura.
    await sb
      .from("projects")
      .update({ total_amount: input.newTotal, updated_at: new Date().toISOString() })
      .eq("id", contrato.project_id)
      .eq("studio_id", studioId)

    const { data: brRaw } = await sb
      .from("booking_requests")
      .select("id, pricing_snapshot")
      .eq("project_id", contrato.project_id)
      .maybeSingle()
    const br = brRaw as {
      id: string
      pricing_snapshot: Record<string, unknown> | null
    } | null
    if (br) {
      const snap = { ...(br.pricing_snapshot ?? {}) }
      const pct = Number(snap.deposit_percent ?? 50)
      snap.price = input.newTotal
      snap.deposit_amount = Number(((input.newTotal * pct) / 100).toFixed(2))
      await sb
        .from("booking_requests")
        .update({ pricing_snapshot: snap })
        .eq("id", br.id)
    }
  }

  // ── 2. Archivar la firma anterior ────────────────────────────────────────
  const { data: prevRaw } = await sb
    .from("contract_amendments")
    .select("version")
    .eq("contract_id", contractId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  const version = Number((prevRaw as { version?: number } | null)?.version ?? 0) + 1

  const { error: insErr } = await sb.from("contract_amendments").insert({
    studio_id: studioId,
    contract_id: contractId,
    version,
    summary,
    changes,
    previous_status: contrato.status,
    previous_signed_at: contrato.signed_at,
    previous_signed_name: contrato.signed_name,
    previous_signed_email: contrato.signed_email,
    previous_signed_ip: contrato.signed_ip,
    previous_signature_image_url: contrato.signature_image_url,
    previous_evidence_hash: contrato.evidence_hash,
    previous_body_snapshot: contrato.body_snapshot,
    created_by: actorId,
  })
  if (insErr) throwServiceError("CONTRACT_AMEND_FAILED", insErr, { contractId })

  // ── 3. El contrato vuelve a estar pendiente (mismo enlace) ───────────────
  const now = new Date().toISOString()
  const { data: upd } = await svc
    .from("contracts")
    .update({
      status: "sent",
      sent_at: now,
      signed_at: null,
      signed_name: null,
      signed_email: null,
      signed_ip: null,
      signed_user_agent: null,
      signature_image_url: null,
      evidence_hash: null,
      body_snapshot: null,
      // La firma del estudio también cae: el documento es otro.
      studio_signed_at: null,
      studio_signed_by_user_id: null,
      studio_signed_name: null,
      studio_signature_image_url: null,
      viewed_at: null,
      updated_at: now,
    })
    .eq("id", contractId)
    .eq("studio_id", studioId)
    .select("id")
  // RLS bloqueada devuelve 0 filas SIN error: por eso se comprueba el conteo.
  if (!upd || upd.length === 0) {
    throwServiceError(
      "CONTRACT_AMEND_FAILED",
      new Error("no se pudo reabrir el contrato para firma"),
      { contractId },
    )
  }

  // ── 4. Avisarle al cliente qué cambió ────────────────────────────────────
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://my.abbypixel.com"
  const signUrl = contrato.signing_token
    ? `${base}/sign/${contrato.signing_token}`
    : null

  let clientNotified = false
  if (input.notifyClient !== false && signUrl) {
    try {
      const { sendContractAmendedEmail } = await import(
        "./contract-amend-email.service"
      )
      clientNotified = await sendContractAmendedEmail({
        studioId,
        contractId,
        summary,
        changes,
        signUrl,
      })
    } catch (err) {
      console.error("[amendContract] aviso al cliente falló", err)
    }
  }

  try {
    await logActivity({
      studioId,
      actorId: actorId ?? undefined,
      action: "contract.amended",
      entityType: "contract",
      entityId: contractId,
      description: `Contrato modificado (v${version}): ${summary}`,
      metadata: { version, changes, clientNotified },
    })
  } catch (err) {
    console.error("[amendContract] historial falló", err)
  }

  return { ok: true, version, changes, clientNotified, signUrl }
}

/** Historial de modificaciones, lo más reciente primero. */
export async function getContractAmendments(
  studioId: string,
  contractId: string,
) {
  const sb = untypedService()
  const { data } = await sb
    .from("contract_amendments")
    .select(
      "id, version, summary, changes, previous_signed_at, previous_signed_name, created_at",
    )
    .eq("studio_id", studioId)
    .eq("contract_id", contractId)
    .order("version", { ascending: false })
  return (data ?? []) as Array<{
    id: string
    version: number
    summary: string
    changes: AmendChange[]
    previous_signed_at: string | null
    previous_signed_name: string | null
    created_at: string
  }>
}

/** Para la página pública de firma: solo lo que el cliente debe saber. */
export async function getPublicAmendmentNotice(signingToken: string) {
  const sb = untypedService()
  const { data: cRaw } = await sb
    .from("contracts")
    .select("id")
    .eq("signing_token", signingToken)
    .is("deleted_at", null)
    .maybeSingle()
  const id = (cRaw as { id?: string } | null)?.id
  if (!id) return null

  const { data } = await sb
    .from("contract_amendments")
    .select("version, summary, changes, created_at")
    .eq("contract_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data ?? null) as {
    version: number
    summary: string
    changes: AmendChange[]
    created_at: string
  } | null
}
