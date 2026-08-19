import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { listQuotes } from "@/server/services/booking-quote.service"
import { untypedService } from "@/server/supabase/untyped"
import { AppTopbar } from "@/components/layout/app-topbar"
import { QuoteManager } from "@/components/quotes/quote-manager"

export const metadata: Metadata = { title: "Cotizaciones · StudioFlow" }

// Los montos y estados cambian al aceptarse una cotización: siempre fresco.
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export default async function CotizacionesPage() {
  const session = await requireStudioAuth()
  const sb = untypedService()

  const [quotes, pkgRes, studioRes] = await Promise.all([
    listQuotes(session.studioId),
    sb
      .from("packages")
      .select(
        "id, name, price, is_active, delivery_days, edited_photos, gallery_book_enabled",
      )
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("price", { ascending: false }),
    sb.from("studios").select("currency").eq("id", session.studioId).maybeSingle(),
  ])

  // Al elegir un plan dentro de un evento, el formulario se autocompleta con
  // lo que ese plan entrega: fotos, plazo y si lleva Book Experience.
  const packages = ((pkgRes.data ?? []) as Array<Record<string, unknown>>)
    .filter((p) => p.is_active !== false)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name ?? ""),
      price: Number(p.price ?? 0),
      deliveryDays: p.delivery_days == null ? null : Number(p.delivery_days),
      photoCount: p.edited_photos == null ? null : Number(p.edited_photos),
      bookEnabled: p.gallery_book_enabled === true,
    }))
  const currency =
    ((studioRes.data as { currency?: string } | null)?.currency as string) ?? "DOP"

  return (
    <>
      <AppTopbar
        eyebrow="Clientes y sesiones"
        title="Cotizaciones"
        description="Registra lo que acordaste por WhatsApp: al cliente le llega un correo, completa sus datos y firma el contrato — sin que tengas que aprobar nada otra vez"
      />
      <div className="p-6">
        <QuoteManager quotes={quotes} packages={packages} currency={currency} />
      </div>
    </>
  )
}
