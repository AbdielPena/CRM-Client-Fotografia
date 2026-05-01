import { notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Check, Clock, Image as ImageIcon, Calendar } from "lucide-react"
import { createSupabasePublicClient } from "@/server/supabase/server"
import { formatCurrency } from "@/lib/utils/currency"
import type { Metadata } from "next"

// Página pública del paquete. Sin auth. Accesible a anon vía RLS
// `packages_public_select` + `studios_public_select` (is_active && !deleted).
// URL: /p/[studioSlug]/[packageSlug]

interface PageParams {
  studio: string
  pkg: string
}

type PackageRow = {
  id: string
  studio_id: string
  name: string
  slug: string
  description: string | null
  long_description: string | null
  price: number | string
  currency: string
  duration_hours: number | null
  edited_photos: number | null
  includes: string[] | null
  cover_image_url: string | null
  gallery_images: string[] | null
  event_type: string | null
  reserve_due_in_days: number | null
  deposit_percent: number | null
}

type StudioRow = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string | null
  secondary_color: string | null
  website: string | null
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
  currency: string | null
}

async function fetchPackage(studioSlug: string, packageSlug: string) {
  const supabase = createSupabasePublicClient()

  // Usamos las vistas `studios_public` / `packages_public` que solo exponen
  // columnas seguras (sin storage, taxes, tokens, etc.).
  const { data: studioRaw } = await supabase
    .from("studios_public")
    .select(
      "id, name, slug, logo_url, primary_color, secondary_color, website, email, phone, city, country, currency",
    )
    .eq("slug", studioSlug)
    .maybeSingle()

  const studio = studioRaw as (StudioRow & { id: string }) | null
  if (!studio) return null

  const { data: pkg } = await supabase
    .from("packages_public")
    .select(
      "id, studio_id, name, slug, description, long_description, price, currency, duration_hours, edited_photos, includes, cover_image_url, gallery_images, event_type, reserve_due_in_days, deposit_percent",
    )
    .eq("studio_id", studio.id)
    .eq("slug", packageSlug)
    .maybeSingle()

  if (!pkg) return null

  return { studio: studio as unknown as StudioRow, pkg: pkg as unknown as PackageRow }
}

export async function generateMetadata({
  params,
}: {
  params: PageParams
}): Promise<Metadata> {
  const result = await fetchPackage(params.studio, params.pkg)
  if (!result) return { title: "Paquete no disponible" }

  const { studio, pkg } = result
  return {
    title: `${pkg.name} · ${studio.name}`,
    description:
      pkg.description ?? `Paquete fotográfico ${pkg.name} de ${studio.name}`,
    openGraph: {
      title: `${pkg.name} · ${studio.name}`,
      description: pkg.description ?? undefined,
      images: pkg.cover_image_url ? [pkg.cover_image_url] : undefined,
    },
  }
}

export default async function PublicPackagePage({
  params,
}: {
  params: PageParams
}) {
  const result = await fetchPackage(params.studio, params.pkg)
  if (!result) notFound()

  const { studio, pkg } = result

  // Normalizar includes (puede venir como array JSON desde Postgres)
  const includes = Array.isArray(pkg.includes)
    ? (pkg.includes as string[]).filter(Boolean)
    : []

  const gallery = Array.isArray(pkg.gallery_images)
    ? (pkg.gallery_images as string[]).filter(Boolean)
    : []

  const bookingHref = `/p/${params.studio}/${params.pkg}/book`

  const primary = studio.primary_color ?? "#111827"
  const secondary = studio.secondary_color ?? "#f9fafb"

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {studio.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={studio.logo_url}
                alt={studio.name}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div
                className="h-9 w-9 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                style={{ backgroundColor: primary }}
              >
                {studio.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900">{studio.name}</p>
              {(studio.city || studio.country) && (
                <p className="text-xs text-gray-500">
                  {[studio.city, studio.country].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          </div>
          {studio.website && (
            <a
              href={studio.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              {studio.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </header>

      {/* Hero */}
      {pkg.cover_image_url ? (
        <div className="relative h-72 sm:h-96 w-full bg-gray-200 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pkg.cover_image_url}
            alt={pkg.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-5 sm:px-8 pb-6 max-w-5xl mx-auto">
            <p className="text-xs uppercase tracking-wider text-white/80 font-medium mb-1">
              {pkg.event_type ?? "Sesión fotográfica"}
            </p>
            <h1 className="text-3xl sm:text-5xl font-bold text-white">
              {pkg.name}
            </h1>
          </div>
        </div>
      ) : (
        <div
          className="px-5 sm:px-8 py-16"
          style={{ backgroundColor: secondary }}
        >
          <div className="max-w-5xl mx-auto">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">
              {pkg.event_type ?? "Sesión fotográfica"}
            </p>
            <h1
              className="text-3xl sm:text-5xl font-bold"
              style={{ color: primary }}
            >
              {pkg.name}
            </h1>
          </div>
        </div>
      )}

      {/* Body */}
      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Descripción */}
          {(pkg.description || pkg.long_description) && (
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                Sobre este paquete
              </h2>
              {pkg.description && (
                <p className="text-gray-700 leading-relaxed mb-3">
                  {pkg.description}
                </p>
              )}
              {pkg.long_description && (
                <p className="text-gray-600 leading-relaxed whitespace-pre-line">
                  {pkg.long_description}
                </p>
              )}
            </section>
          )}

          {/* Incluye */}
          {includes.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                ¿Qué incluye?
              </h2>
              <ul className="space-y-2.5">
                {includes.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <Check
                      className="h-5 w-5 mt-0.5 flex-shrink-0"
                      style={{ color: primary }}
                    />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Galería */}
          {gallery.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-gray-500" />
                Galería
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {gallery.slice(0, 6).map((url, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={idx}
                    src={url}
                    alt={`${pkg.name} — imagen ${idx + 1}`}
                    className="aspect-square w-full object-cover rounded-lg"
                    loading="lazy"
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sticky sidebar con precio + CTA */}
        <aside className="lg:sticky lg:top-8 h-fit">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">
              Inversión
            </p>
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrency(Number(pkg.price), pkg.currency)}
            </p>
            {pkg.deposit_percent && pkg.deposit_percent > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Reserva con {pkg.deposit_percent}% (
                {formatCurrency(
                  (Number(pkg.price) * pkg.deposit_percent) / 100,
                  pkg.currency,
                )}
                )
              </p>
            )}

            <div className="mt-5 space-y-2.5 text-sm">
              {pkg.duration_hours ? (
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span>
                    {pkg.duration_hours}{" "}
                    {pkg.duration_hours === 1 ? "hora" : "horas"} de sesión
                  </span>
                </div>
              ) : null}
              {pkg.edited_photos ? (
                <div className="flex items-center gap-2 text-gray-600">
                  <ImageIcon className="h-4 w-4 text-gray-400" />
                  <span>{pkg.edited_photos} fotos editadas</span>
                </div>
              ) : null}
              {pkg.reserve_due_in_days ? (
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span>
                    Reserva en los próximos {pkg.reserve_due_in_days} días
                  </span>
                </div>
              ) : null}
            </div>

            <Link
              href={bookingHref}
              className="mt-6 block w-full text-center py-3 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: primary }}
            >
              Reservar ahora
            </Link>

            {(studio.email || studio.phone) && (
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                {studio.email && (
                  <p>
                    ¿Dudas? Escribe a{" "}
                    <a
                      href={`mailto:${studio.email}`}
                      className="text-gray-700 hover:underline"
                    >
                      {studio.email}
                    </a>
                  </p>
                )}
                {studio.phone && (
                  <p>
                    O llama al{" "}
                    <a
                      href={`tel:${studio.phone}`}
                      className="text-gray-700 hover:underline"
                    >
                      {studio.phone}
                    </a>
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-4">
            Powered by StudioFlow
          </p>
        </aside>
      </main>
    </div>
  )
}

// Evita que Next intente SSG sin contexto; siempre SSR (requiere datos frescos)
export const dynamic = "force-dynamic"

// Image import mantenido para satisfacer TypeScript si se refactoriza a next/image
void Image
