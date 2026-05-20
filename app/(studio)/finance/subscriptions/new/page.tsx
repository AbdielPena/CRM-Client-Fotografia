import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { untypedServer } from "@/server/supabase/untyped"

import { AppTopbar } from "@/components/layout/app-topbar"

import { NewSubscriptionForm } from "./new-subscription-form"

export const metadata: Metadata = {
  title: "Nueva suscripción · Finanzas",
}

export default async function NewSubscriptionPage() {
  const session = await requireStudioAuth()
  const sb = untypedServer()

  const [accountsRes, cardsRes, categoriesRes, unread] = await Promise.all([
    sb
      .from("fin_accounts")
      .select("id, nombre, currency")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("nombre")
      .limit(100),
    sb
      .from("fin_cards")
      .select("id, descripcion")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("descripcion")
      .limit(100),
    sb
      .from("fin_categories")
      .select("id, nombre, tipo")
      .eq("studio_id", session.studioId)
      .eq("tipo", "gasto")
      .is("deleted_at", null)
      .order("nombre")
      .limit(100),
    countUnreadNotifications(session.studioId),
  ])

  const accounts = (accountsRes.data ?? []) as Array<{
    id: string
    nombre: string
    currency: string
  }>
  const cards = (cardsRes.data ?? []) as Array<{
    id: string
    descripcion: string
  }>
  const categories = (categoriesRes.data ?? []) as Array<{
    id: string
    nombre: string
    tipo: string
  }>

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas / Suscripciones"
        title="Nueva suscripción"
        description="Configura un gasto recurrente. El cron diario crea el cargo automáticamente cuando llega la fecha."
        unreadNotifications={unread}
        actions={
          <Link
            href="/finance/subscriptions"
            className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Cancelar
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <NewSubscriptionForm
          accounts={accounts}
          cards={cards}
          categories={categories}
        />
      </div>
    </>
  )
}
