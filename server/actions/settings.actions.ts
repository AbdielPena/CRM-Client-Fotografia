"use server"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
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
