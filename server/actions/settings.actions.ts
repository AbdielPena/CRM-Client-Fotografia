"use server"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { setDefaultFinanzAppAccount } from "@/server/services/finanzapp-bridge.service"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const updateStudioSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().url("URL inválida").optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().length(3, "Código de moneda debe tener 3 caracteres"),
  timezone: z.string().optional(),
  invoicePrefix: z.string().max(10).optional(),
  invoiceFooter: z.string().max(500).optional(),
  contractFooter: z.string().max(500).optional(),
  taxId: z.string().optional(),
  paymentInstructions: z.string().max(2000).optional(),
  paymentWhatsapp: z.string().max(40).optional(),
})

export type UpdateStudioInput = z.infer<typeof updateStudioSchema>

// Mapeo camelCase (form) → snake_case (DB)
const FIELD_MAP: Record<string, string> = {
  name: "name",
  email: "email",
  phone: "phone",
  website: "website",
  address: "address",
  city: "city",
  country: "country",
  currency: "currency",
  timezone: "timezone",
  invoicePrefix: "invoice_prefix",
  invoiceFooter: "invoice_footer",
  contractFooter: "contract_footer",
  taxId: "tax_id",
  paymentInstructions: "payment_instructions",
  paymentWhatsapp: "payment_whatsapp",
}

export async function updateStudioAction(input: UpdateStudioInput) {
  const session = await requireStudioAuth()
  const data = updateStudioSchema.parse(input)

  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    const col = FIELD_MAP[k]
    if (!col) continue
    patch[col] = v === "" ? null : v
  }

  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from("studios")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", session.studioId)

  if (error) {
    console.error("[updateStudioAction] failed", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/settings")
  return { success: true }
}

/**
 * Settea (o limpia) la cuenta de FinanzApp (fi.abbypixel.com) a la que se
 * asignan por defecto los pagos de facturas (Stripe y manuales).
 * Pasar `null` la desactiva.
 */
export async function updateDefaultFinanceAccountAction(
  accountId: string | null,
) {
  const session = await requireStudioAuth()
  try {
    await setDefaultFinanzAppAccount(session.studioId, session.userId, accountId)
    revalidatePath("/settings")
    return { success: true as const }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo actualizar la cuenta default"
    console.error("[updateDefaultFinanceAccountAction] failed", err)
    return { success: false as const, error: message }
  }
}

export async function updateStudioLogoAction(logoUrl: string) {
  const session = await requireStudioAuth()
  const supabase = createSupabaseServerClient()

  const { error } = await supabase
    .from("studios")
    .update({ logo_url: logoUrl })
    .eq("id", session.studioId)

  if (error) {
    console.error("[updateStudioLogoAction] failed", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/settings")
  return { success: true }
}
