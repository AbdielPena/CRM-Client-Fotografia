import Link from "next/link"
import { CheckCircle2, Clock, Mail } from "lucide-react"
import { createSupabasePublicClient } from "@/server/supabase/server"

export const dynamic = "force-dynamic"

interface PageParams {
  studio: string
  pkg: string
}

async function fetchStudio(studioSlug: string) {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from("studios_public")
    .select("name, slug, logo_url, primary_color, email, phone, website")
    .eq("slug", studioSlug)
    .maybeSingle()
  return data as
    | {
        name: string
        slug: string
        logo_url: string | null
        primary_color: string | null
        email: string | null
        phone: string | null
        website: string | null
      }
    | null
}

export default async function BookingSuccessPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams?: { rid?: string; dup?: string }
}) {
  const studio = await fetchStudio(params.studio)
  const isDuplicate = searchParams?.dup === "1"
  const primary = studio?.primary_color ?? "#111827"
  const shortId = searchParams?.rid
    ? searchParams.rid.slice(0, 8).toUpperCase()
    : null

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-5 py-12">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-10 text-center">
          <div
            className="mx-auto h-14 w-14 rounded-full flex items-center justify-center mb-5"
            style={{ backgroundColor: `${primary}15` }}
          >
            <CheckCircle2 className="h-7 w-7" style={{ color: primary }} />
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            {isDuplicate
              ? "Tu solicitud ya estaba registrada"
              : "¡Solicitud recibida!"}
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed mb-6">
            {isDuplicate
              ? "Detectamos que ya nos habías enviado esta misma solicitud. No te preocupes: la estamos revisando."
              : `Gracias por elegir ${studio?.name ?? "nuestro studio"}. Revisaremos tu solicitud y te contactaremos en las próximas 24 horas.`}
          </p>

          {shortId && (
            <div className="inline-block bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 mb-6">
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                Código de referencia
              </p>
              <p className="text-sm font-mono font-semibold text-gray-900">
                #{shortId}
              </p>
            </div>
          )}

          <div className="space-y-3 text-left bg-gray-50 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <Clock className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Tiempo de respuesta
                </p>
                <p className="text-xs text-gray-500">
                  Solemos contestar en menos de 24 horas.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Revisa tu email
                </p>
                <p className="text-xs text-gray-500">
                  Te enviaremos la confirmación y los siguientes pasos para
                  asegurar tu fecha.
                </p>
              </div>
            </div>
          </div>

          {(studio?.email || studio?.phone) && (
            <div className="text-xs text-gray-500 mb-6">
              ¿Urgente? Contáctanos directamente:{" "}
              {studio.email && (
                <a
                  href={`mailto:${studio.email}`}
                  className="text-gray-700 hover:underline"
                >
                  {studio.email}
                </a>
              )}
              {studio.email && studio.phone && " · "}
              {studio.phone && (
                <a
                  href={`tel:${studio.phone}`}
                  className="text-gray-700 hover:underline"
                >
                  {studio.phone}
                </a>
              )}
            </div>
          )}

          <Link
            href={`/p/${params.studio}/${params.pkg}`}
            className="inline-block px-5 py-2.5 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: primary }}
          >
            Ver paquete nuevamente
          </Link>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by StudioFlow
        </p>
      </div>
    </div>
  )
}
