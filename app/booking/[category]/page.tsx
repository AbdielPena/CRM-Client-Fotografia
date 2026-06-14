import { notFound } from "next/navigation"
import Link from "next/link"
import { Check, Clock, Image as ImageIcon, ArrowRight, CalendarHeart, Mail, Phone } from "lucide-react"
import type { Metadata } from "next"
import type { SupabaseClient } from "@supabase/supabase-js"

import { createSupabasePublicClient } from "@/server/supabase/server"
import { formatCurrency } from "@/lib/utils/currency"

/**
 * Link público POR CATEGORÍA de planes.  URL: /booking/[categoria]
 *
 * Muestra SOLO los planes activos de esa categoría del estudio. Al elegir un
 * plan, el cliente continúa el flujo de reserva existente (/p/[studio]/[pkg]),
 * que crea la solicitud/proyecto como hoy. No altera ese flujo.
 *
 * El estudio se resuelve por slug por defecto (un solo estudio: AbbyPixel);
 * configurable con NEXT_PUBLIC_DEFAULT_STUDIO_SLUG.
 */

const DEFAULT_STUDIO_SLUG = process.env["NEXT_PUBLIC_DEFAULT_STUDIO_SLUG"] ?? "abbypixel"

type StudioRow = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string | null
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
  currency: string | null
}

type CategoryRow = {
  id: string
  name: string
  slug: string
  description: string | null
}

type PackageRow = {
  id: string
  name: string
  slug: string
  description: string | null
  price: number | string
  currency: string
  cover_image_url: string | null
  includes: string[] | null
  duration_hours: number | null
  edited_photos: number | null
  event_type: string | null
}

async function fetchCategoryBooking(categorySlug: string) {
  // Cliente sin tipos: la vista service_categories_public y la columna
  // service_category_id (recién añadidas) aún no están en los tipos generados.
  const supabase = createSupabasePublicClient() as unknown as SupabaseClient

  const { data: studioRaw } = await supabase
    .from("studios_public")
    .select("id, name, slug, logo_url, primary_color, email, phone, city, country, currency")
    .eq("slug", DEFAULT_STUDIO_SLUG)
    .maybeSingle()
  const studio = studioRaw as StudioRow | null
  if (!studio) return null

  const { data: catRaw } = await supabase
    .from("service_categories_public")
    .select("id, name, slug, description")
    .eq("studio_id", studio.id)
    .eq("slug", categorySlug)
    .maybeSingle()
  const category = catRaw as CategoryRow | null
  if (!category) return null // categoría inactiva o inexistente → no disponible

  const { data: pkgRaw } = await supabase
    .from("packages_public")
    .select(
      "id, name, slug, description, price, currency, cover_image_url, includes, duration_hours, edited_photos, event_type, sort_order",
    )
    .eq("studio_id", studio.id)
    .eq("service_category_id", category.id)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true })

  const packages = (pkgRaw ?? []) as unknown as PackageRow[]
  return { studio, category, packages }
}

export async function generateMetadata({
  params,
}: {
  params: { category: string }
}): Promise<Metadata> {
  const result = await fetchCategoryBooking(params.category)
  if (!result) return { title: "Categoría no disponible" }
  const { studio, category } = result
  return {
    title: `${category.name} · ${studio.name}`,
    description: category.description ?? `Planes de ${category.name} de ${studio.name}`,
  }
}

export default async function CategoryBookingPage({
  params,
}: {
  params: { category: string }
}) {
  const result = await fetchCategoryBooking(params.category)
  if (!result) notFound()

  const { studio, category, packages } = result

  return (
    <div className="relative">
      {/* ─────────────── Header ─────────────── */}
      <header className="sticky top-0 z-30 lx-glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            {studio.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={studio.logo_url}
                alt={studio.name}
                className="h-7 w-auto max-w-[150px] object-contain"
              />
            ) : (
              <span className="brand-logo text-foreground/90" role="img" aria-label={studio.name} />
            )}
            {(studio.city || studio.country) && (
              <>
                <span className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
                <p className="hidden text-[11px] tracking-wide text-muted-foreground sm:block">
                  {[studio.city, studio.country].filter(Boolean).join(", ")}
                </p>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ─────────────── Hero de categoría ─────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-cream-50 to-background px-5 py-16 text-center sm:px-8 sm:py-24">
        <div className="bg-luxe-radial pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-2xl">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft">
            <CalendarHeart className="h-5 w-5 text-gold-600" />
          </div>
          <p className="lx-overline mb-3">Reserva tu sesión</p>
          <h1 className="font-serif text-4xl font-semibold leading-[1.05] text-foreground sm:text-6xl">
            {category.name}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            {category.description ??
              "Elige el plan que mejor se adapte a lo que sueñas. Compara y reserva en minutos."}
          </p>
          <div className="mx-auto mt-8 w-24 lx-hairline" />
        </div>
      </section>

      {/* ─────────────── Planes ─────────────── */}
      <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
        {packages.length === 0 ? (
          <div className="lx-card mx-auto max-w-md p-10 text-center">
            <p className="font-serif text-2xl text-foreground">Pronto, muy pronto</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Estamos preparando los planes de <strong>{category.name}</strong>. Escríbenos y con
              gusto te asesoramos mientras tanto.
            </p>
            {(studio.email || studio.phone) && (
              <div className="mt-6 flex flex-col items-center gap-2 text-[13px] text-muted-foreground">
                {studio.email && (
                  <a href={`mailto:${studio.email}`} className="flex items-center gap-2 hover:text-gold-700">
                    <Mail className="h-3.5 w-3.5" /> {studio.email}
                  </a>
                )}
                {studio.phone && (
                  <a href={`tel:${studio.phone}`} className="flex items-center gap-2 hover:text-gold-700">
                    <Phone className="h-3.5 w-3.5" /> {studio.phone}
                  </a>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="lx-overline mb-7 text-center">
              {packages.length} {packages.length === 1 ? "plan disponible" : "planes disponibles"}
            </p>
            <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((pkg) => {
                const includes = Array.isArray(pkg.includes)
                  ? (pkg.includes as string[]).filter(Boolean)
                  : []
                const href = `/p/${studio.slug}/${pkg.slug}`
                return (
                  <article key={pkg.id} className="lx-card lx-card-hover flex flex-col overflow-hidden">
                    {pkg.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pkg.cover_image_url}
                        alt={pkg.name}
                        className="h-44 w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-cream-50 to-brand-soft/40">
                        <ImageIcon className="h-8 w-8 text-gold-600/50" />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-6">
                      {pkg.event_type && <p className="lx-overline mb-2">{pkg.event_type}</p>}
                      <h2 className="font-serif text-2xl font-semibold leading-tight text-foreground">
                        {pkg.name}
                      </h2>
                      {pkg.description && (
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {pkg.description}
                        </p>
                      )}

                      <p className="mt-4 font-serif text-3xl font-semibold text-foreground">
                        {formatCurrency(Number(pkg.price), pkg.currency)}
                      </p>

                      <div className="mt-3 space-y-1.5 text-[13px] text-foreground/80">
                        {pkg.duration_hours ? (
                          <span className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-gold-600" />
                            {pkg.duration_hours} {pkg.duration_hours === 1 ? "hora" : "horas"}
                          </span>
                        ) : null}
                        {pkg.edited_photos ? (
                          <span className="flex items-center gap-2">
                            <ImageIcon className="h-3.5 w-3.5 text-gold-600" />
                            {pkg.edited_photos} fotografías editadas
                          </span>
                        ) : null}
                      </div>

                      {includes.length > 0 && (
                        <ul className="mt-4 space-y-2 border-t border-border pt-4">
                          {includes.slice(0, 3).map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-[13px] text-foreground/85">
                              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gold-600" />
                              <span>{item}</span>
                            </li>
                          ))}
                          {includes.length > 3 && (
                            <li className="text-[12px] text-muted-foreground">
                              +{includes.length - 3} más…
                            </li>
                          )}
                        </ul>
                      )}

                      <Link href={href} className="lx-btn-gold mt-6 w-full justify-center">
                        Ver y reservar <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}

        <p className="mt-14 text-center text-[11px] tracking-wide text-muted-foreground/70">
          Una experiencia de {studio.name}
        </p>
      </main>
    </div>
  )
}

// Datos siempre frescos (sin Data Cache de Next): refleja altas/bajas de planes
// y de la categoría al instante.
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
