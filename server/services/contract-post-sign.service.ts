/**
 * Hook post-firma — dispara los emails correctos según quién firmó.
 *
 * Lógica:
 *   - Solo cliente firmó       → emailContractSignedByClient (notif al studio)
 *   - Solo studio firmó        → emailContractSignedByStudio (al cliente)
 *   - Ambos firmaron           → además emailContractFinalCopy (a ambos)
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import {
  emailContractFinalCopy,
  emailContractSignedByClient,
  emailContractSignedByStudio,
} from "@/server/services/contract-emails.service"

export async function onContractSigned(contractId: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, signed_at, studio_signed_at")
    .eq("id", contractId)
    .maybeSingle()
  if (!contract) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = contract as any

  const clientSigned = !!c.signed_at
  const studioSigned = !!c.studio_signed_at

  // El que disparó el hook: solo enviamos el email del que acaba de firmar
  // (el último update). Para diferenciar comparamos timestamps. Si no
  // podemos determinar (ambos coinciden), enviamos los dos.
  if (clientSigned && !studioSigned) {
    await emailContractSignedByClient(contractId)
    return
  }
  if (studioSigned && !clientSigned) {
    await emailContractSignedByStudio(contractId)
    return
  }
  if (clientSigned && studioSigned) {
    // Detectar quién firmó último: si signed_at > studio_signed_at, fue cliente
    const clientTs = c.signed_at ? new Date(c.signed_at).getTime() : 0
    const studioTs = c.studio_signed_at ? new Date(c.studio_signed_at).getTime() : 0
    if (clientTs > studioTs) {
      await emailContractSignedByClient(contractId)
    } else {
      await emailContractSignedByStudio(contractId)
    }
    // Y la copia final a ambos
    await emailContractFinalCopy(contractId)
  }
}
