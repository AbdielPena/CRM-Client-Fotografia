"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createFinSubscription,
  pauseFinSubscription,
  resumeFinSubscription,
} from "@/server/services/fin-subscription.service"
import {
  createFinSubscriptionSchema,
  type CreateFinSubscriptionInput,
} from "@/lib/validations/fin-subscription.schema"

export type FinSubscriptionActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  subscriptionId?: string
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

function mapErrorToMessage(code: string): string {
  switch (code) {
    case "FIN_SUB_NOMBRE_REQUIRED":
      return "El nombre es requerido."
    case "FIN_SUB_MONTO_REQUIRED":
      return "El monto debe ser mayor que 0."
    default:
      return code
  }
}

export async function createFinSubscriptionAction(
  _prev: FinSubscriptionActionState,
  formData: FormData,
): Promise<FinSubscriptionActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)

  const raw = {
    nombre: formData.get("nombre"),
    monto: (formData.get("monto") as string) || undefined,
    currency: (formData.get("currency") as string) || undefined,
    frecuencia: formData.get("frecuencia"),
    diaCobro: (formData.get("diaCobro") as string) || undefined,
    cuentaId: (formData.get("cuentaId") as string) || undefined,
    tarjetaId: (formData.get("tarjetaId") as string) || undefined,
    categoriaId: (formData.get("categoriaId") as string) || undefined,
    proximaFecha: formData.get("proximaFecha"),
  }

  const parsed = createFinSubscriptionSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
      values,
    }
  }

  let subscriptionId: string
  try {
    const sub = await createFinSubscription(
      session.studioId,
      session.userId,
      parsed.data as CreateFinSubscriptionInput,
    )
    subscriptionId = sub.id
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? mapErrorToMessage(err.message)
          : "Error desconocido.",
      values,
    }
  }

  revalidatePath("/finance/subscriptions")
  redirect(`/finance/subscriptions/${subscriptionId}`)
}

export async function pauseFinSubscriptionAction(
  subscriptionId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await pauseFinSubscription(session.studioId, session.userId, subscriptionId)
    revalidatePath(`/finance/subscriptions/${subscriptionId}`)
    revalidatePath("/finance/subscriptions")
    return { ok: true, message: "Suscripción pausada." }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
    }
  }
}

export async function resumeFinSubscriptionAction(
  subscriptionId: string,
  proximaFecha: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(proximaFecha)) {
    return { ok: false, message: "Fecha inválida." }
  }

  try {
    await resumeFinSubscription(
      session.studioId,
      session.userId,
      subscriptionId,
      proximaFecha,
    )
    revalidatePath(`/finance/subscriptions/${subscriptionId}`)
    revalidatePath("/finance/subscriptions")
    return { ok: true, message: "Suscripción reanudada." }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
    }
  }
}
