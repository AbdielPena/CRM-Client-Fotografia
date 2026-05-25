import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { formatNcf, NCF_REQUIRES_RNC, type NcfType } from "@/lib/fiscal"
import type {
  CreateNcfSequenceInput,
  UpdateNcfSequenceInput,
  UpsertTaxConfigInput,
} from "@/lib/validations/fiscal.schema"

/**
 * Service de NCF/ITBIS (Fiscal RD).
 *
 * Responsabilidades:
 *   - CRUD de fiscal_ncf_sequences (secuencias por tipo B01..B17 + rangos DGII)
 *   - Upsert de fiscal_tax_configs (RNC studio, ITBIS rate, default NCF type)
 *   - issueNcfForInvoice(): wrap de la RPC atómica `assign_next_ncf` y update
 *     de la invoice con ncf + ncf_type + ncf_sequence_id
 *
 * La atomicidad de asignación de NCF vive en la RPC PL/pgSQL (FOR UPDATE
 * SKIP LOCKED) — ver migration 20260520000100_fiscal_init.sql. Este service
 * solo wrappea la RPC y aplica el resultado a la invoice.
 */

// ============================================================================
// Tipos
// ============================================================================

export type NcfSequenceRow = {
  id: string
  studio_id: string
  type: NcfType
  prefix: string
  range_from: number
  range_to: number
  current_value: number
  status: "ACTIVE" | "PAUSED" | "EXHAUSTED"
  expires_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type TaxConfigRow = {
  id: string
  studio_id: string
  itbis_rate: number
  isr_retention: number | null
  rnc: string | null
  business_name: string | null
  default_ncf_type: NcfType | null
  created_at: string
  updated_at: string
}

// ============================================================================
// NCF Sequences — CRUD
// ============================================================================

export async function getNcfSequences(
  studioId: string,
  opts: { status?: "ACTIVE" | "PAUSED" | "EXHAUSTED"; type?: NcfType } = {},
) {
  const sb = untypedServer()
  let query = sb
    .from("fiscal_ncf_sequences")
    .select("*")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("type", { ascending: true })
    .order("range_from", { ascending: true })

  if (opts.status) query = query.eq("status", opts.status)
  if (opts.type) query = query.eq("type", opts.type)

  const { data, error } = await query
  if (error) throwServiceError("FISCAL_NCF_OP_FAILED", error)
  return (data ?? []) as NcfSequenceRow[]
}

export async function createNcfSequence(
  studioId: string,
  actorId: string,
  data: CreateNcfSequenceInput,
) {
  const sb = untypedService()

  // Validar overlap de rango: no permitir crear secuencia ACTIVE de mismo type
  // que solape el rango de otra ya activa o pausada (que pueda reactivarse).
  const { data: existing } = await sb
    .from("fiscal_ncf_sequences")
    .select("range_from, range_to, status")
    .eq("studio_id", studioId)
    .eq("type", data.type)
    .is("deleted_at", null)
    .in("status", ["ACTIVE", "PAUSED"])

  if (Array.isArray(existing)) {
    for (const row of existing as Array<{ range_from: number; range_to: number }>) {
      const overlap = data.rangeFrom < row.range_to && data.rangeTo > row.range_from
      if (overlap) {
        throw new Error("FISCAL_NCF_RANGE_OVERLAP")
      }
    }
  }

  const payload = {
    studio_id: studioId,
    type: data.type,
    prefix: data.prefix,
    range_from: data.rangeFrom,
    range_to: data.rangeTo,
    current_value: 0,
    status: "ACTIVE",
    expires_at: data.expiresAt ?? null,
    notes: data.notes ?? null,
  }

  const { data: row, error } = await sb
    .from("fiscal_ncf_sequences")
    .insert(payload)
    .select("*")
    .single()

  if (error) throwServiceError("FISCAL_NCF_CREATE_FAILED", error, { studioId })

  const sequence = row as NcfSequenceRow
  await logActivity({
    studioId,
    actorId,
    entityType: "fiscal_ncf_sequence",
    entityId: sequence.id,
    action: "fiscal_ncf_sequence.created",
    metadata: { type: data.type, range_from: data.rangeFrom, range_to: data.rangeTo },
  })

  return sequence
}

export async function updateNcfSequence(
  studioId: string,
  actorId: string,
  sequenceId: string,
  data: UpdateNcfSequenceInput,
) {
  const sb = untypedService()
  const patch: Record<string, unknown> = {}
  if (data.status !== undefined) patch.status = data.status
  if (data.expiresAt !== undefined) patch.expires_at = data.expiresAt
  if (data.notes !== undefined) patch.notes = data.notes

  const { data: row, error } = await sb
    .from("fiscal_ncf_sequences")
    .update(patch)
    .eq("id", sequenceId)
    .eq("studio_id", studioId)
    .select("*")
    .single()

  if (error)
    throwServiceError("FISCAL_NCF_UPDATE_FAILED", error, { studioId, sequenceId })

  await logActivity({
    studioId,
    actorId,
    entityType: "fiscal_ncf_sequence",
    entityId: sequenceId,
    action: "fiscal_ncf_sequence.updated",
    metadata: data as Record<string, unknown>,
  })

  return row as NcfSequenceRow
}

// ============================================================================
// Tax Config — upsert
// ============================================================================

export async function getTaxConfig(studioId: string): Promise<TaxConfigRow | null> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("fiscal_tax_configs")
    .select("*")
    .eq("studio_id", studioId)
    .maybeSingle()

  if (error) throwServiceError("FISCAL_TAX_CONFIG_OP_FAILED", error)
  return (data ?? null) as TaxConfigRow | null
}

export async function upsertTaxConfig(
  studioId: string,
  actorId: string,
  data: UpsertTaxConfigInput,
) {
  const sb = untypedService()
  const payload = {
    studio_id: studioId,
    itbis_rate: data.itbisRate,
    isr_retention: data.isrRetention ?? null,
    rnc: data.rnc ?? null,
    business_name: data.businessName ?? null,
    default_ncf_type: data.defaultNcfType ?? null,
  }

  const { data: row, error } = await sb
    .from("fiscal_tax_configs")
    .upsert(payload, { onConflict: "studio_id" })
    .select("*")
    .single()

  if (error)
    throwServiceError("FISCAL_TAX_CONFIG_UPSERT_FAILED", error, { studioId })

  await logActivity({
    studioId,
    actorId,
    entityType: "fiscal_tax_config",
    entityId: (row as TaxConfigRow).id,
    action: "fiscal_tax_config.upserted",
    metadata: data as Record<string, unknown>,
  })

  return row as TaxConfigRow
}

// ============================================================================
// issueNcfForInvoice — el flujo crítico
// ============================================================================

export type IssueNcfResult = {
  ncf: string
  ncfType: NcfType
  sequenceId: string
  prefix: string
  sequenceValue: number
}

/**
 * Asigna el siguiente NCF a una invoice. Atomicidad garantizada por la RPC
 * PL/pgSQL `assign_next_ncf` que usa FOR UPDATE SKIP LOCKED dentro de la
 * transacción Postgres.
 *
 * Flow:
 *   1. Verificar que la invoice exista en este studio y no tenga NCF ya asignado
 *   2. Resolver tipo NCF: explícito, sino default del tax_config, sino B02 (Consumo)
 *   3. Validar RNC del cliente si tipo lo requiere (B01, B03, B14, B15, B16)
 *   4. Llamar RPC assign_next_ncf
 *   5. Update invoice con ncf + ncf_type + ncf_sequence_id
 *   6. Activity log
 *
 * Errores:
 *   - INVOICE_NOT_FOUND        — invoice no existe o no pertenece al studio
 *   - INVOICE_NCF_ALREADY_SET  — ya tiene NCF (no se re-emite)
 *   - NCF_RNC_REQUIRED         — tipo NCF requiere RNC y cliente no lo tiene
 *   - NO_ACTIVE_NCF_SEQUENCE   — la RPC lo lanza si no hay secuencia con cupo
 */
export async function issueNcfForInvoice(
  studioId: string,
  actorId: string,
  invoiceId: string,
  ncfType?: NcfType,
): Promise<IssueNcfResult> {
  const sb = untypedService()

  // 1. Validar invoice
  const { data: invoice } = await sb
    .from("invoices")
    .select("id, studio_id, ncf, ncf_type, client_id")
    .eq("id", invoiceId)
    .eq("studio_id", studioId)
    .maybeSingle()

  if (!invoice) throw new Error("INVOICE_NOT_FOUND")
  if (invoice.ncf) throw new Error("INVOICE_NCF_ALREADY_SET")

  // 2. Resolver tipo
  let resolvedType: NcfType
  if (ncfType) {
    resolvedType = ncfType
  } else {
    const config = await getTaxConfig(studioId)
    resolvedType = (config?.default_ncf_type as NcfType | null) ?? "B02"
  }

  // 3. Validar RNC del cliente si el tipo lo requiere
  if (NCF_REQUIRES_RNC.has(resolvedType)) {
    const { data: client } = await sb
      .from("clients")
      .select("id, document_number, rnc")
      .eq("id", invoice.client_id)
      .eq("studio_id", studioId)
      .maybeSingle()
    const hasRnc = !!(client?.rnc || client?.document_number)
    if (!hasRnc) {
      throw new Error("NCF_RNC_REQUIRED")
    }
  }

  // 4. Llamar RPC atómica
  const { data: rpcData, error: rpcError } = await sb.rpc("assign_next_ncf", {
    p_studio_id: studioId,
    p_type: resolvedType,
  })

  if (rpcError) {
    // La RPC lanza NO_ACTIVE_NCF_SEQUENCE con ERRCODE P0001 si no hay cupo
    if (rpcError.message?.includes("NO_ACTIVE_NCF_SEQUENCE")) {
      throw new Error("NO_ACTIVE_NCF_SEQUENCE")
    }
    throwServiceError("FISCAL_NCF_ASSIGN_FAILED", rpcError, { studioId, invoiceId })
  }

  // La RPC devuelve TABLE — Supabase JS lo entrega como array
  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData
  if (!result?.ncf || !result?.sequence_id) {
    throw new Error("NO_ACTIVE_NCF_SEQUENCE")
  }

  const issued: IssueNcfResult = {
    ncf: result.ncf,
    ncfType: resolvedType,
    sequenceId: result.sequence_id,
    prefix: result.prefix,
    sequenceValue: result.sequence_value,
  }

  // 5. Update invoice
  const { error: updateErr } = await sb
    .from("invoices")
    .update({
      ncf: issued.ncf,
      ncf_type: issued.ncfType,
      ncf_sequence_id: issued.sequenceId,
    })
    .eq("id", invoiceId)
    .eq("studio_id", studioId)

  if (updateErr) {
    // CRITICAL: si esto falla, ya quemamos un NCF de la secuencia. Loguear con
    // detalle para auditoría DGII. La secuencia avanzó — no podemos "desasignar"
    // sin riesgo de gap, así que registramos el incidente y dejamos el NCF
    // huérfano (recuperable manualmente).
    console.error("[fiscal-ncf] NCF asignado pero invoice update falló — NCF huérfano:", {
      invoiceId,
      issued,
      error: updateErr,
    })
    throwServiceError("FISCAL_NCF_INVOICE_UPDATE_FAILED", updateErr, {
      studioId,
      invoiceId,
      orphan_ncf: issued.ncf,
    })
  }

  // 6. Activity log
  await logActivity({
    studioId,
    actorId,
    entityType: "invoice",
    entityId: invoiceId,
    action: "invoice.ncf_assigned",
    metadata: {
      ncf: issued.ncf,
      ncf_type: issued.ncfType,
      sequence_id: issued.sequenceId,
    },
  })

  return issued
}

/**
 * Helper: dado un type NCF y un sequence_value, regenera el string del NCF
 * sin tocar DB. Útil para PDFs / displays.
 */
export function renderNcf(prefix: string, sequenceValue: number): string {
  return formatNcf(prefix, sequenceValue)
}
