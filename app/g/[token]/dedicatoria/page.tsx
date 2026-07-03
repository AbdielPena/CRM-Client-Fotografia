import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { validateGalleryToken } from "@/server/services/gallery.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"

import { DedicationForm } from "./dedication-form"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export const metadata: Metadata = {
  title: "Dedicatoria",
  robots: { index: false, follow: false },
}

const SERIF = "var(--font-serif), 'Playfair Display', 'Palatino Linotype', Georgia, serif"

export default async function DedicationPage({
  params,
}: {
  params: { token: string }
}) {
  const view = await validateGalleryToken(params.token)
  if (!view) notFound()

  const sb = createSupabaseServiceClient()
  const { data: g } = await sb
    .from("galleries")
    .select("mother_message, mother_message_from, project_id")
    .eq("id", view.gallery.id)
    .maybeSingle()
  const row =
    (g as {
      mother_message: string | null
      mother_message_from: string | null
      project_id: string | null
    } | null) ?? null

  let quinceName: string | null = null
  let motherName: string | null = null
  if (row?.project_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: proj } = await (sb as any)
      .from("projects")
      .select("quinceanera_name, mother_name")
      .eq("id", row.project_id)
      .maybeSingle()
    quinceName = (proj as { quinceanera_name: string | null } | null)?.quinceanera_name ?? null
    motherName = (proj as { mother_name: string | null } | null)?.mother_name ?? null
  }

  return (
    <main style={{ minHeight: "100vh", background: "#FAF8F4", color: "#1D1A16" }}>
      <div className="mx-auto w-full max-w-xl px-6 py-14 sm:py-20">
        <p
          className="text-center font-semibold uppercase"
          style={{ color: "#A9884E", fontSize: "0.66rem", letterSpacing: "0.24em" }}
        >
          Dedicatoria
        </p>
        <h1
          className="mt-3 text-balance text-center"
          style={{ fontFamily: SERIF, fontSize: "clamp(1.9rem,5.5vw,2.7rem)", lineHeight: 1.15 }}
        >
          Un mensaje para {quinceName ?? "tu hija"}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-center text-sm" style={{ color: "#8C8478" }}>
          Escríbele unas palabras desde el corazón — aparecerán en su galería de
          fotos, para que las guarde por siempre.
        </p>

        <DedicationForm
          token={params.token}
          initialMessage={row?.mother_message ?? ""}
          initialFrom={row?.mother_message_from ?? motherName ?? ""}
          galleryHref={`/g/${params.token}`}
        />
      </div>
    </main>
  )
}
