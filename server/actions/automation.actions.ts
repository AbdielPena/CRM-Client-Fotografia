"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createAutomationRule,
  deleteAutomationRule,
  updateAutomationRule,
} from "@/server/services/automation.service"
import {
  createAutomationSchema,
  type CreateAutomationInput,
} from "@/lib/validations/automation.schema"

export type AutomationActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  ruleId?: string
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

export async function createAutomationAction(
  _prev: AutomationActionState,
  formData: FormData,
): Promise<AutomationActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)

  const raw = {
    name: formData.get("name"),
    description: (formData.get("description") as string) || undefined,
    triggerEvent: formData.get("triggerEvent"),
    triggerFiltersJson:
      (formData.get("triggerFiltersJson") as string) || undefined,
    actionKind: formData.get("actionKind"),
    actionConfigJson: formData.get("actionConfigJson"),
    isActive: formData.get("isActive") === "on",
  }

  const parsed = createAutomationSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  let ruleId: string
  try {
    const triggerFilters = parsed.data.triggerFiltersJson
      ? (JSON.parse(parsed.data.triggerFiltersJson) as Record<string, unknown>)
      : {}
    const actionConfig = JSON.parse(parsed.data.actionConfigJson) as Record<
      string,
      unknown
    >
    const rule = await createAutomationRule(session.studioId, session.userId, {
      name: parsed.data.name,
      description: parsed.data.description,
      triggerEvent: parsed.data.triggerEvent as CreateAutomationInput["triggerEvent"],
      triggerFilters,
      actionKind: parsed.data.actionKind as CreateAutomationInput["actionKind"],
      actionConfig,
      isActive: parsed.data.isActive,
    })
    ruleId = rule.id
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
      values,
    }
  }

  revalidatePath("/automations")
  redirect(`/automations/${ruleId}`)
}

export async function toggleAutomationAction(
  ruleId: string,
  nextActive: boolean,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await updateAutomationRule(session.studioId, session.userId, ruleId, {
      isActive: nextActive,
    })
    revalidatePath(`/automations/${ruleId}`)
    revalidatePath("/automations")
    return { ok: true, message: nextActive ? "Activada" : "Pausada" }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
    }
  }
}

export async function deleteAutomationAction(
  ruleId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await deleteAutomationRule(session.studioId, session.userId, ruleId)
    revalidatePath("/automations")
    return { ok: true, message: "Regla eliminada" }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
    }
  }
}
