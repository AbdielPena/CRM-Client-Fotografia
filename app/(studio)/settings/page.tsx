import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinAccountsWithBalances } from "@/server/services/fin-account.service"
import { SettingsForm } from "@/components/settings/settings-form"
import { DefaultFinanceAccountForm } from "@/components/settings/default-finance-account-form"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Configuración" }

export default async function SettingsPage() {
  const session = await requireStudioAuth()
  const supabase = createSupabaseServerClient()

  async function loadDefaultAccountId(): Promise<string | null> {
    try {
      const { data } = await supabase
        .from("studios")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("default_finance_account_id" as any)
        .eq("id", session.studioId)
        .maybeSingle()
      return (
        (data as { default_finance_account_id: string | null } | null)
          ?.default_finance_account_id ?? null
      )
    } catch {
      return null
    }
  }

  type FinAccountList = Awaited<ReturnType<typeof getFinAccountsWithBalances>>
  async function loadFinAccounts(): Promise<FinAccountList> {
    try {
      return await getFinAccountsWithBalances(session.studioId, { activaOnly: true })
    } catch {
      return []
    }
  }

  const [studioResult, unread, finAccounts, defaultAccountId] = await Promise.all([
    supabase
      .from("studios")
      .select(
        "id, name, email, phone, website, address, city, country, logo_url, currency, timezone, invoice_prefix, invoice_footer, contract_footer, tax_id, payment_instructions, payment_whatsapp, plan",
      )
      .eq("id", session.studioId)
      .maybeSingle(),
    countUnreadNotifications(session.studioId),
    loadFinAccounts(),
    loadDefaultAccountId(),
  ])
  const studio = studioResult.data

  if (!studio) return null

  const accountOptions = finAccounts.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    bancoNombre: a.banco?.nombre ?? null,
    currency: a.currency,
  }))

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Configuración"
        description="Administra el perfil y preferencias de tu estudio"
        unreadNotifications={unread}
      />
      <div className="px-6 py-6 lg:px-8 lg:py-8 max-w-3xl space-y-6">
        {/* plan may be null from DB; SettingsForm handles it */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <SettingsForm studio={studio as any} />
        <DefaultFinanceAccountForm
          accounts={accountOptions}
          currentAccountId={defaultAccountId}
        />
      </div>
    </>
  )
}
