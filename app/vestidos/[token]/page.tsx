import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { getDressSelectionByToken } from "@/server/services/dress-selection.service"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export const metadata: Metadata = {
  title: "Selección de vestidos · AbbyPixel",
  robots: { index: false, follow: false },
}

export default async function DressSelectionPage({
  params,
}: {
  params: { token: string }
}) {
  const sel = await getDressSelectionByToken(params.token)
  if (!sel) notFound()

  const count = sel.dresses.length
  const created = new Date(sel.createdAt).toLocaleDateString("es-DO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <main className="min-h-screen bg-[#f7f4ef] text-[#1c1a17]">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        {/* Encabezado */}
        <header className="mb-8 text-center sm:mb-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#b89968]">
            Selección de vestidos · AbbyPixel
          </p>
          <h1 className="mt-3 font-serif text-3xl font-semibold leading-tight sm:text-4xl">
            {sel.clientName}
          </h1>
          <p className="mt-2 text-sm text-[#6b6258]">
            Eligió {count} {count === 1 ? "vestido" : "vestidos"} para probarse en su sesión
          </p>

          {(sel.tentativeDate || sel.planInterest) && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {sel.planInterest && (
                <span className="rounded-full border border-[#e3dccf] bg-white/70 px-3 py-1 text-xs font-medium text-[#6b6258]">
                  Plan: {sel.planInterest}
                </span>
              )}
              {sel.tentativeDate && (
                <span className="rounded-full border border-[#e3dccf] bg-white/70 px-3 py-1 text-xs font-medium text-[#6b6258]">
                  Fecha tentativa: {sel.tentativeDate}
                </span>
              )}
            </div>
          )}
        </header>

        {/* Grid de vestidos */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5">
          {sel.dresses.map((d, i) => (
            <figure
              key={i}
              className="overflow-hidden rounded-2xl border border-[#e8e1d5] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="aspect-[3/4] w-full overflow-hidden bg-[#efeae1]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.image}
                  alt={d.name || "Vestido"}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              {d.name ? (
                <figcaption className="px-3 py-2.5 text-center font-serif text-sm text-[#1c1a17]">
                  {d.name}
                </figcaption>
              ) : (
                <figcaption className="px-3 py-2.5 text-center text-xs text-[#9a9082]">
                  Vestido #{i + 1}
                </figcaption>
              )}
            </figure>
          ))}
        </section>

        {/* Pie */}
        <footer className="mt-10 border-t border-[#e3dccf] pt-5 text-center text-xs text-[#9a9082]">
          Selección guardada el {created} · AbbyPixel
        </footer>
      </div>
    </main>
  )
}
