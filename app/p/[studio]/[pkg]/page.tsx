import { notFound } from "next/navigation"
import Link from "next/link"
import {
  Check,
  Clock,
  Image as ImageIcon,
  CalendarDays,
  ChevronDown,
  ShieldCheck,
  Heart,
  Mail,
  Phone,
} from "lucide-react"
import { createSupabasePublicClient } from "@/server/supabase/server"
import { formatCurrency } from "@/lib/utils/currency"
import type { Metadata } from "next"

// Página pública del paquete. Sin auth. Accesible a anon vía RLS
// `packages_public_select` + `studios_public_select` (is_active && !deleted).
// URL: /p/[studioSlug]/[packageSlug]
// Rediseño premium (luxury): hero editorial, bienvenida emocional, includes
// elegante, galería, tarjeta de inversión sticky con CTA dorado.

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

  const includes = Array.isArray(pkg.includes)
    ? (pkg.includes as string[]).filter(Boolean)
    : []
  const gallery = Array.isArray(pkg.gallery_images)
    ? (pkg.gallery_images as string[]).filter(Boolean)
    : []

  const bookingHref = `/p/${params.studio}/${params.pkg}/book`
  const eventLabel = pkg.event_type ?? "Sesión fotográfica"
  const firstName = studio.name
  const depositAmount =
    pkg.deposit_percent && pkg.deposit_percent > 0
      ? (Number(pkg.price) * pkg.deposit_percent) / 100
      : null

  return (
    <div className="relative">
      {/* ─────────────── Header glass ─────────────── */}
      <header className="sticky top-0 z-30 lx-glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            {studio.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={studio.logo_url}
                alt={studio.name}
                className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 font-serif text-base font-semibold text-white">
                {studio.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="leading-tight">
              <p className="font-serif text-base font-semibold text-foreground">
                {studio.name}
              </p>
              {(studio.city || studio.country) && (
                <p className="text-[11px] tracking-wide text-muted-foreground">
                  {[studio.city, studio.country].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          </div>
          <Link
            href={bookingHref}
            className="lx-btn-gold hidden !px-5 !py-2 text-[13px] sm:inline-flex"
          >
            Reservar
          </Link>
        </div>
      </header>

      {/* ─────────────── Hero ─────────────── */}
      {pkg.cover_image_url ? (
        <section className="relative h-[72vh] min-h-[460px] w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pkg.cover_image_url}
            alt={pkg.name}
            className="h-full w-full origin-center animate-kenburns object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[hsl(28_30%_8%/0.78)] via-[hsl(28_30%_10%/0.25)] to-[hsl(28_30%_10%/0.05)]" />
          <div className="absolute inset-x-0 bottom-0">
            <div className="mx-auto max-w-6xl px-5 pb-12 sm:px-8 sm:pb-16">
              <p
                className="lx-overline mb-3 animate-fade-in-up text-gold-200"
                style={{ animationDelay: "80ms" }}
              >
                {eventLabel}
              </p>
              <h1
                className="max-w-3xl animate-fade-in-up font-serif text-4xl font-semibold leading-[1.05] text-white drop-shadow-sm sm:text-6xl lg:text-7xl"
                style={{ animationDelay: "160ms" }}
              >
                {pkg.name}
              </h1>
              {pkg.description && (
                <p
                  className="mt-4 max-w-xl animate-fade-in-up font-serif-soft text-lg leading-relaxed text-white/85 sm:text-xl"
                  style={{ animationDelay: "260ms" }}
                >
                  {pkg.description}
                </p>
              )}
            </div>
          </div>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/70">
            <ChevronDown className="h-5 w-5 animate-bounce" />
          </div>
        </section>
      ) : (
        <section className="relative overflow-hidden bg-gradient-to-b from-cream-50 to-background px-5 py-24 sm:px-8 sm:py-32">
          <div className="bg-luxe-radial pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-6xl text-center">
            <p className="lx-overline mb-4">{eventLabel}</p>
            <h1 className="mx-auto max-w-3xl font-serif text-5xl font-semibold leading-[1.05] text-foreground sm:text-7xl">
              {pkg.name}
            </h1>
            {pkg.description && (
              <p className="mx-auto mt-5 max-w-xl font-serif-soft text-xl leading-relaxed text-muted-foreground">
                {pkg.description}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ─────────────── Bienvenida emocional ─────────────── */}
      <section className="border-b border-border/60 bg-gradient-to-b from-background to-cream-50/40 px-5 py-16 text-center sm:px-8 sm:py-20">
        <div className="mx-auto max-w-2xl">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft">
            <Heart className="h-5 w-5 text-gold-600" />
          </div>
          <h2 className="font-serif text-3xl font-medium leading-snug text-foreground sm:text-4xl">
            Bienvenida a tu experiencia con{" "}
            <span className="text-gradient-gold">{firstName}</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            Estamos honrados de ser parte de un momento tan especial. Antes de
            continuar, conoce cada detalle pensado para que esta experiencia sea
            inolvidable.
          </p>
          <div className="mx-auto mt-8 w-24 lx-hairline" />
        </div>
      </section>

      {/* ─────────────── Cuerpo ─────────────── */}
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-14 sm:px-8 lg:grid-cols-3 lg:gap-14 lg:py-20">
        <div className="space-y-14 lg:col-span-2">
          {/* Sobre la experiencia */}
          {(pkg.description || pkg.long_description) && (
            <section>
              <p className="lx-overline mb-3">Sobre esta experiencia</p>
              {pkg.description && (
                <p className="font-serif-soft text-xl leading-relaxed text-foreground/90">
                  {pkg.description}
                </p>
              )}
              {pkg.long_description && (
                <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                  {pkg.long_description}
                </p>
              )}
            </section>
          )}

          {/* Incluye */}
          {includes.length > 0 && (
            <section>
              <p className="lx-overline mb-5">La experiencia incluye</p>
              <ul className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                {includes.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft">
                      <Check className="h-3.5 w-3.5 text-gold-600" />
                    </span>
                    <span className="text-[15px] leading-relaxed text-foreground/90">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Galería */}
          {gallery.length > 0 && (
            <section>
              <p className="lx-overline mb-5 flex items-center gap-2">
                <ImageIcon className="h-3.5 w-3.5" />
                Galería
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gallery.slice(0, 6).map((url, idx) => (
                  <div
                    key={idx}
                    className={`group relative overflow-hidden rounded-2xl ${
                      idx === 0 ? "col-span-2 row-span-2 aspect-square sm:aspect-auto" : "aspect-square"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`${pkg.name} — imagen ${idx + 1}`}
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Promesa de marca (banda editorial) */}
          <section className="rounded-3xl bg-gradient-to-br from-cream-50 to-brand-soft/50 px-8 py-12 text-center">
            <p className="mx-auto max-w-xl font-serif-soft text-2xl italic leading-relaxed text-foreground/90">
              “Cada imagen es un recuerdo que vivirá para siempre. Nos
              dedicamos a capturar la emoción real de tu día.”
            </p>
            <p className="lx-overline mt-5">{studio.name}</p>
          </section>
        </div>

        {/* Tarjeta de inversión sticky */}
        <aside className="lg:sticky lg:top-24 h-fit">
          <div className="lx-card p-7">
            <p className="lx-overline mb-2">Inversión</p>
            <p className="font-serif text-4xl font-semibold text-foreground">
              {formatCurrency(Number(pkg.price), pkg.currency)}
            </p>
            {depositAmount !== null && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Reserva con {pkg.deposit_percent}% ·{" "}
                <span className="font-medium text-gold-700">
                  {formatCurrency(depositAmount, pkg.currency)}
                </span>
              </p>
            )}

            <div className="mt-6 space-y-3.5 border-t border-border pt-6 text-sm">
              {pkg.duration_hours ? (
                <DetailRow
                  icon={<Clock className="h-4 w-4" />}
                  text={`${pkg.duration_hours} ${pkg.duration_hours === 1 ? "hora" : "horas"} de sesión`}
                />
              ) : null}
              {pkg.edited_photos ? (
                <DetailRow
                  icon={<ImageIcon className="h-4 w-4" />}
                  text={`${pkg.edited_photos} fotografías editadas`}
                />
              ) : null}
              {pkg.reserve_due_in_days ? (
                <DetailRow
                  icon={<CalendarDays className="h-4 w-4" />}
                  text={`Reserva en los próximos ${pkg.reserve_due_in_days} días`}
                />
              ) : null}
            </div>

            <Link href={bookingHref} className="lx-btn-gold mt-7 w-full">
              Reservar ahora
            </Link>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-gold-600" />
              Confirmación en menos de 24 horas
            </p>

            {(studio.email || studio.phone) && (
              <div className="mt-6 space-y-2 border-t border-border pt-5 text-[13px] text-muted-foreground">
                {studio.email && (
                  <a
                    href={`mailto:${studio.email}`}
                    className="flex items-center gap-2 transition-colors hover:text-gold-700"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {studio.email}
                  </a>
                )}
                {studio.phone && (
                  <a
                    href={`tel:${studio.phone}`}
                    className="flex items-center gap-2 transition-colors hover:text-gold-700"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {studio.phone}
                  </a>
                )}
              </div>
            )}
          </div>

          <p className="mt-5 text-center text-[11px] tracking-wide text-muted-foreground/70">
            Una experiencia de {studio.name}
          </p>
        </aside>
      </main>
    </div>
  )
}

function DetailRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 text-foreground/80">
      <span className="text-gold-600">{icon}</span>
      <span>{text}</span>
    </div>
  )
}

// Siempre SSR (requiere datos frescos)
export const dynamic = "force-dynamic"
