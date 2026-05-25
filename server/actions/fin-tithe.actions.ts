"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  markTithePaid,
  upsertTitheForPeriod,
} from "@/server/services/fin-tithe.service"

export type FinTitheActionState = {
  ok?: boolean
  message?: string
  titheId?: string
  baseCalculo?: number
  montoDiezmo?: number
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
    case "INVALID_PERIOD_FORMAT":
      return "El periodo debe estar en formato YYYY-MM."
    case "FIN_TITHE_NOT_FOUND":
      return "Registro no encontrado."
    case "FIN_TITHE_ALREADY_PAID":
      return "Este diezmo ya está marcado como pagado."
    default:
      return code
  }
}

export async function computeTitheAction(
  _prev: FinTitheActionState,
  formData: FormData,
): Promise<FinTitheActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const period = String(formData.get("period") ?? "")
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return {
      ok: false,
      message: "El periodo debe estar en formato YYYY-MM.",
    }
  }

  try {
    const row = await upsertTitheForPeriod(
      session.studioId,
      session.userId,
      period,
    )
    revalidatePath("/finance/tithe")
    return {
      ok: true,
      message: `Diezmo de ${period} calculado.`,
      titheId: row.id,
      baseCalculo: Number(row.base_calculo),
      montoDiezmo: Number(row.monto_diezmo),
    }
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? mapErrorToMessage(err.message)
          : "Error desconocido.",
    }
  }
}

export async function markTithePaidAction(
  _prev: FinTitheActionState,
  formData: FormData,
): Promise<FinTitheActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const titheId = String(formData.get("titheId") ?? "")
  const fechaPago = String(formData.get("fechaPago") ?? "")
  const cuentaId = (formData.get("cuentaId") as string) || undefined
  const categoriaId = (formData.get("categoriaId") as string) || undefined
  const notas = (formData.get("notas") as string) || undefined
  const createTransaction = formData.get("createTransaction") === "on"

  if (!titheId || !/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
    return {
      ok: false,
      message: "Campos requeridos: titheId + fechaPago (YYYY-MM-DD).",
      values,
    }
  }

  try {
    await markTithePaid(session.studioId, session.userId, {
      titheId,
      fechaPago,
      cuentaId,
      categoriaId,
      notas,
      createTransaction,
    })
    revalidatePath(`/finance/tithe/${titheId}`)
    revalidatePath("/finance/tithe")
    return { ok: true, message: "Diezmo marcado como pagado." }
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
}
