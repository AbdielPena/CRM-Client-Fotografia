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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="bg-luxe-radial pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-md">
        <div className="lx-card animate-fade-in-up p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            {studio.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={studio.logo_url}
                alt={studio.name}
                className="mb-4 h-16 w-16 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 font-serif text-2xl font-semibold text-white">
                {studio.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <p className="lx-overline mb-1.5">Registro</p>
            <h1 className="font-serif text-2xl font-semibold text-foreground">
              {studio.name}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Completa tus datos para que{" "}
              <span className="font-medium text-gold-700">{studio.name}</span> pueda
              contactarte. No necesitas elegir un paquete ahora — te enviaremos
              opciones después.
            </p>
          </div>

          <PublicRegisterForm
            studioSlug={params.slug}
            studioName={studio.name}
            contactEmail={studio.email}
          />
        </div>
        <p className="mt-5 text-center text-[11px] tracking-wide text-muted-foreground/60">
          Una experiencia de {studio.name}
        </p>
      </div>
    </div>
  )
}
