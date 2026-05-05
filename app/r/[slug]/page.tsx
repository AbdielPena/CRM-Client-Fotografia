import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { PublicRegisterForm } from "./register-form"

export const dynamic = "force-dynamic"

type PageProps = { params: { slug: string } }

async function getStudio(slug: string) {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from("studios")
    .select("id, name, logo_url, primary_color, email")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) console.error("[/r/] getStudio error", error)
  return data as
    | {
        id: string
        name: string
        logo_url: string | null
        primary_color: string | null
        email: string | null
      }
    | null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const studio = await getStudio(params.slug)
  if (!studio) return { title: "Studio no encontrado" }
  return {
    title: `Registro · ${studio.name}`,
    description: `Regístrate como cliente de ${studio.name}`,
    openGraph: studio.logo_url ? { images: [{ url: studio.logo_url }] } : undefined,
  }
}

export default async function PublicRegisterPage({ params }: PageProps) {
  const studio = await getStudio(params.slug)
  if (!studio) notFound()

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          {studio.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={studio.logo_url}
              alt={studio.name}
              className="h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            <div
              className="h-12 w-12 rounded-lg grid place-items-center text-white text-lg font-semibold"
              style={{ backgroundColor: studio.primary_color ?? "#0D0E14" }}
            >
              {studio.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">{studio.name}</h1>
            <p className="text-xs text-zinc-500">Formulario de registro</p>
          </div>
        </div>

        <p className="text-sm text-zinc-600 mb-6">
          Completa tus datos para que <strong>{studio.name}</strong> pueda
          contactarte. No es necesario seleccionar un paquete ahora — te
          enviaremos opciones después.
        </p>

        <PublicRegisterForm
          studioSlug={params.slug}
          studioName={studio.name}
          contactEmail={studio.email}
        />
      </div>
    </div>
  )
}
