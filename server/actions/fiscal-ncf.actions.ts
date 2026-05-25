"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createNcfSequence,
  updateNcfSequence,
  upsertTaxConfig,
  issueNcfForInvoice,
  type IssueNcfResult,
} from "@/server/services/fiscal-ncf.service"
import {
  createNcfSequenceSchema,
  updateNcfSequenceSchema,
  upsertTaxConfigSchema,
  issueNcfSchema,
  type CreateNcfSequenceInput,
  type UpdateNcfSequenceInput,
  type UpsertTaxConfigInput,
} from "@/lib/validations/fiscal.schema"
import type { NcfType } from "@/lib/fiscal"

// ---------------------------------------------------------------------------
// State types para useActionState
// ---------------------------------------------------------------------------

export type FiscalActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

// ---------------------------------------------------------------------------
// Tax Config — upsert (único registro por studio)
// ---------------------------------------------------------------------------

export async function upsertTaxConfigAction(
  _prevState: FiscalActionState,
  formData: FormData,
): Promise<FiscalActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const raw = {
    itbisRate: Number(formData.get("itbisRate") ?? 18),
    isrRetention: formData.get("isrRetention")
      ? Number(formData.get("isrRetention"))
      : undefined,
    rnc: formData.get("rnc"),
    businessName: formData.get("businessName"),
    defaultNcfType: formData.get("defaultNcfType"),
  }

  const parsed = upsertTaxConfigSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló. Revisa los campos marcados.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  try {
    await upsertTaxConfig(
      session.studioId,
      session.userId,
      parsed.data as UpsertTaxConfigInput,
    )
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error al guardar configuración.",
      values,
    }
  }

  revalidatePath("/settings/fiscal")
  return { ok: true, message: "Configuración fiscal guardada." }
}

// ---------------------------------------------------------------------------
// NCF Sequence — crear
// ---------------------------------------------------------------------------

export async function createNcfSequenceAction(
  _prevState: FiscalActionState,
  formData: FormData,
): Promise<FiscalActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const raw = {
    type: formData.get("type"),
    prefix: formData.get("prefix") || undefined,
    rangeFrom: Number(formData.get("rangeFrom") ?? 1),
    rangeTo: Number(formData.get("rangeTo") ?? 0),
    expiresAt: formData.get("expiresAt") || undefined,
    notes: formData.get("notes") || undefined,
  }

  const parsed = createNcfSequenceSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  try {
    await createNcfSequence(
      session.studioId,
      session.userId,
      parsed.data as CreateNcfSequenceInput,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear secuencia."
    if (msg === "FISCAL_NCF_RANGE_OVERLAP") {
      return {
        ok: false,
        message:
          "Este rango se solapa con una secuencia existente del mismo tipo. Ajusta los valores o desactiva la anterior.",
        values,
      }
    }
    return { ok: false, message: msg, values }
  }

  revalidatePath("/settings/fiscal")
  return { ok: true, message: "Secuencia NCF creada." }
}

// ---------------------------------------------------------------------------
// NCF Sequence — update (status / expiresAt / notes)
// ---------------------------------------------------------------------------

export async function updateNcfSequenceAction(
  sequenceId: string,
  data: UpdateNcfSequenceInput,
): Promise<FiscalActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const parsed = updateNcfSequenceSchema.safeParse(data)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  try {
    await updateNcfSequence(session.studioId, session.userId, sequenceId, parsed.data)
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error al actualizar secuencia.",
    }
  }

  revalidatePath("/settings/fiscal")
  return { ok: true, message: "Secuencia actualizada." }
}

// ---------------------------------------------------------------------------
// Issue NCF — asignar a una invoice específica (UX desde botón en /invoices/[id])
// ---------------------------------------------------------------------------

export type IssueNcfActionResult =
  | { ok: true; result: IssueNcfResult }
  | { ok: false; message: string; code?: string }

export async function issueNcfForInvoiceAction(input: {
  invoiceId: string
  ncfType?: NcfType
}): Promise<IssueNcfActionResult> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró.", code: "UNAUTHENTICATED" }
  }

  const parsed = issueNcfSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Datos inválidos.",
      code: "VALIDATION_FAILED",
    }
  }

  try {
    const result = await issueNcfForInvoice(
      session.studioId,
      session.userId,
      parsed.data.invoiceId,
      parsed.data.type,
    )
    revalidatePath(`/invoices/${input.invoiceId}`)
    revalidatePath("/invoices")
    return { ok: true, result }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido."
    // Mensajes UX-friendly por código
    const userMessages: Record<string, string> = {
      INVOICE_NOT_FOUND: "Factura no encontrada.",
      INVOICE_NCF_ALREADY_SET:
        "Esta factura ya tiene NCF asignado. No se puede emitir de nuevo (regla DGII).",
      NCF_RNC_REQUIRED:
        "El tipo NCF seleccionado requiere RNC. Edita el cliente y agrega su RNC o cédula antes de emitir.",
      NO_ACTIVE_NCF_SEQUENCE:
        "No hay secuencia NCF activa con cupo. Configura una en Ajustes → Fiscal.",
    }
    return {
      ok: false,
      message: userMessages[msg] ?? msg,
      code: msg,
    }
  }
}
