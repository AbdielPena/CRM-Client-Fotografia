import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { headers } from "next/headers"
import { ArrowLeft, CalendarCheck2 } from "lucide-react"
import { createSupabasePublicClient } from "@/server/supabase/server"
import { formatCurrency } from "@/lib/utils/currency"
import { createBookingRequestSchema } from "@/lib/validations/booking-request.schema"
import { createPublicBookingRequest } from "@/server/services/booking-request.service"

export const dynamic = "force-dynamic"

interface PageParams {
  studio: string
  pkg: string
}

// Re-usamos la vista pública para mostrar contexto del paquete al lado del form.
async function fetchPackageSummary(studioSlug: string, packageSlug: string) {
  const supabase = createSupabasePublicClient()

  const { data: studio } = await supabase
    .from("studios_public")
    .select(
      "id, name, slug, logo_url, primary_color, secondary_color, currency, city, country",
    )
    .eq("slug", studioSlug)
    .maybeSingle()

  if (!studio) return null

  const { data: pkg } = await supabase
    .from("packages_public")
    .select(
      "id, name, slug, price, currency, duration_hours, edited_photos, event_type, deposit_percent",
    )
    .eq("studio_id", (studio as { id: string }).id)
    .eq("slug", packageSlug)
    .maybeSingle()

  if (!pkg) return null

  return {
    studio: studio as {
      id: string
      name: string
      slug: string
      logo_url: string | null
      primary_color: string | null
      secondary_color: string | null
      currency: string | null
      city: string | null
      country: string | null
    },
    pkg: pkg as {
      id: string
      name: string
      slug: string
      price: number | string
      currency: string | null
      duration_hours: number | null
      edited_photos: number | null
      event_type: string | null
      deposit_percent: number | null
    },
  }
}

// Server Action — se ejecuta en el servidor al submit del form.
async function submitBookingRequest(formData: FormData) {
  "use server"

  // Extraer valores crudos del FormData
  const raw = {
    studioSlug: String(formData.get("studioSlug") ?? ""),
    packageSlug: String(formData.get("packageSlug") ?? ""),
    clientName: String(formData.get("clientName") ?? ""),
    clientEmail: String(formData.get("clientEmail") ?? ""),
    clientPhone: String(formData.get("clientPhone") ?? ""),
    clientWhatsapp: String(formData.get("clientWhatsapp") ?? ""),
    eventType: String(formData.get("eventType") ?? ""),
    eventDate: String(formData.get("eventDate") ?? ""),
    eventTime: String(formData.get("eventTime") ?? ""),
    eventLocation: String(formData.get("eventLocation") ?? ""),
    guestCount: formData.get("guestCount")
      ? Number(formData.get("guestCount"))
      : undefined,
    additionalNotes: String(formData.get("additionalNotes") ?? ""),
    website: String(formData.get("website") ?? ""),
    acceptTerms: formData.get("acceptTerms") === "on",
  }

  const parsed = createBookingRequestSchema.safeParse(raw)
  if (!parsed.success) {
    // Redirige con el primer error por querystring; UX mínima para v1.
    const first = parsed.error.issues[0]
    const msg = encodeURIComponent(first?.message ?? "Formulario inválido")
    redirect(`/p/${raw.studioSlug}/${raw.packageSlug}/book?error=${msg}`)
  }

  // IP y user-agent para auditoría anti-abuso
  const hdrs = headers()
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    null
  const userAgent = hdrs.get("user-agent") ?? null

  const result = await createPublicBookingRequest(parsed.data, {
    ip: ip ?? undefined,
    userAgent: userAgent ?? undefined,
  })

  if (result.status === "not_found") {
    notFound()
  }

  if (result.status === "unavailable_date") {
    const msg = encodeURIComponent(
      `Esa fecha no está disponible: ${result.reason}. Por favor elige otra.`,
    )
    redirect(`/p/${raw.studioSlug}/${raw.packageSlug}/book?error=${msg}`)
  }

  // Tanto 'ok' como 'duplicate' redirigen a success (idempotencia UX).
  const id = result.status === "ok" ? result.requestId : result.existingId
  redirect(
    `/p/${raw.studioSlug}/${raw.packageSlug}/book/success?rid=${id}${
      result.status === "duplicate" ? "&dup=1" : ""
    }`,
  )
}

export default async function BookingFormPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams?: { error?: string }
}) {
  const data = await fetchPackageSummary(params.studio, params.pkg)
  if (!data) notFound()

  const { studio, pkg } = data
  const primary = studio.primary_color ?? "#111827"
  const currency = pkg.currency ?? studio.currency ?? "DOP"
  const price = Number(pkg.price)
  const deposit = pkg.deposit_percent
    ? Number(((price * pkg.deposit_percent) / 100).toFixed(2))
    : 0

  const errorMsg = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : null

  // Fecha mínima = hoy en formato yyyy-mm-dd
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, "0")
  const dd = String(today.getDate()).padStart(2, "0")
  const minDate = `${yyyy}-${mm}-${dd}`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
          <Link
            href={`/p/${params.studio}/${params.pkg}`}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al paquete
          </Link>
          <div className="flex items-center gap-3">
            {studio.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={studio.logo_url}
                alt={studio.name}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-white font-semibold text-xs"
                style={{ backgroundColor: primary }}
              >
                {studio.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-semibold text-gray-900">
              {studio.name}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 sm:px-8 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2 flex items-center gap-1.5">
              <CalendarCheck2 className="h-3.5 w-3.5" />
              Solicitud de reserva
            </p>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Reserva tu sesión
            </h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              Completa tus datos y revisaremos tu solicitud en las próximas 24
              horas. Te contactaremos para confirmar disponibilidad y coordinar
              el pago de la reserva.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
              {errorMsg}
            </div>
          )}

          <form
            action={submitBookingRequest}
            className="space-y-6 bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm"
          >
            {/* Hidden: slugs del path */}
            <input type="hidden" name="studioSlug" value={params.studio} />
            <input type="hidden" name="packageSlug" value={params.pkg} />

            {/* Honeypot invisible para humanos — oculto vía CSS y tabIndex */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-9999px",
                width: 1,
                height: 1,
                overflow: "hidden",
              }}
            >
              <label>
                No rellenar
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>
            </div>

            {/* Datos del cliente */}
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                Tus datos
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Nombre completo"
                  name="clientName"
                  required
                  placeholder="Ej: María Pérez"
                />
                <Field
                  label="Email"
                  name="clientEmail"
                  type="email"
                  required
                  placeholder="tu@email.com"
                />
                <Field
                  label="Teléfono"
                  name="clientPhone"
                  type="tel"
                  placeholder="(809) 000-0000"
                />
                <Field
                  label="WhatsApp"
                  name="clientWhatsapp"
                  type="tel"
                  placeholder="(809) 000-0000"
                  hint="Opcional — si es diferente al teléfono"
                />
              </div>
            </div>

            {/* Evento */}
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                Detalles del evento
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Tipo de evento"
                  name="eventType"
                  placeholder={pkg.event_type ?? "Ej: Quinceañera"}
                  defaultValue={pkg.event_type ?? ""}
                />
                <Field
                  label="Fecha del evento"
                  name="eventDate"
                  type="date"
                  required
                  min={minDate}
                />
                <Field
                  label="Hora de inicio"
                  name="eventTime"
                  type="time"
                  hint="Opcional"
                />
                <Field
                  label="Invitados aprox."
                  name="guestCount"
                  type="number"
                  min={0}
                  placeholder="150"
                  hint="Opcional"
                />
                <div className="sm:col-span-2">
                  <Field
                    label="Ubicación"
                    name="eventLocation"
                    placeholder="Ej: Salón Jardín Tropical, Santo Domingo"
                    hint="Dirección, salón o coordenadas"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 mb-1.5 block">
                      Notas adicionales
                    </span>
                    <textarea
                      name="additionalNotes"
                      rows={4}
                      maxLength={2000}
                      placeholder="Cuéntanos detalles importantes: estilo que te gusta, personas clave, referencias, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1"
                      style={{ boxShadow: "none" }}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Consentimiento */}
            <div className="pt-2 border-t border-gray-100">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="acceptTerms"
                  required
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <span className="text-xs text-gray-600 leading-relaxed">
                  Acepto que esta es una solicitud sujeta a disponibilidad. El{" "}
                  studio me contactará para confirmar la fecha y coordinar el
                  pago de reserva. Autorizo el uso de mis datos para gestionar
                  esta reserva.
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: primary }}
            >
              Enviar solicitud
            </button>

            <p className="text-center text-xs text-gray-400">
              Recibirás una confirmación por email en breve.
            </p>
          </form>
        </div>

        {/* Sidebar: resumen del paquete */}
        <aside className="lg:sticky lg:top-8 h-fit">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">
              Tu selección
            </p>
            <p className="text-lg font-bold text-gray-900 mb-1">{pkg.name}</p>
            <p className="text-xs text-gray-500 mb-4">
              {pkg.event_type ?? "Sesión fotográfica"}
            </p>

            <div className="space-y-2 text-sm text-gray-600">
              {pkg.duration_hours ? (
                <div className="flex justify-between">
                  <span>Duración</span>
                  <span className="font-medium text-gray-900">
                    {pkg.duration_hours} h
                  </span>
                </div>
              ) : null}
              {pkg.edited_photos ? (
                <div className="flex justify-between">
                  <span>Fotos editadas</span>
                  <span className="font-medium text-gray-900">
                    {pkg.edited_photos}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500">Total</span>
                <span className="text-2xl font-bold text-gray-900">
                  {formatCurrency(price, currency)}
                </span>
              </div>
              {deposit > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-gray-500">
                    Reserva ({pkg.deposit_percent}%)
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {formatCurrency(deposit, currency)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-4">
            Powered by PixelOS
          </p>
        </aside>
      </main>
    </div>
  )
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  hint,
  defaultValue,
  min,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  placeholder?: string
  hint?: string
  defaultValue?: string
  min?: string | number
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700 mb-1.5 block">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        min={min}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1"
      />
      {hint && <span className="mt-1 text-[11px] text-gray-400">{hint}</span>}
    </label>
  )
}
