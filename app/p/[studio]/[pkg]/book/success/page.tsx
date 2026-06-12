import Link from "next/link"
import { Check, Clock, Mail, Sparkles } from "lucide-react"
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

const STEPS = [
  { label: "Solicitud enviada", state: "done" as const },
  { label: "En revisión", state: "current" as const },
  { label: "Confirmación", state: "todo" as const },
]

export default async function BookingSuccessPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams?: { rid?: string; dup?: string }
}) {
  const studio = await fetchStudio(params.studio)
  const isDuplicate = searchParams?.dup === "1"
  const shortId = searchParams?.rid
    ? searchParams.rid.slice(0, 8).toUpperCase()
    : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-cream-50 to-background px-5 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        {studio?.logo_url ? (
          <div className="mb-6 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={studio.logo_url}
              alt={studio.name}
              className="h-12 w-12 rounded-full object-cover ring-1 ring-border"
            />
          </div>
        ) : null}

        <div className="lx-card animate-fade-in-up p-8 text-center sm:p-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-gold-100 to-brand-soft">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600">
              <Check className="h-6 w-6 text-white" />
            </div>
          </div>

          <p className="lx-overline mb-3">
            {isDuplicate ? "Ya te teníamos" : "Recibido con cariño"}
          </p>
          <h1 className="font-serif text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
            {isDuplicate
              ? "Tu solicitud ya estaba registrada"
              : "¡Tu solicitud fue recibida!"}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            {isDuplicate
              ? "Detectamos que ya nos habías enviado esta misma solicitud. No te preocupes: la estamos revisando con atención."
              : `Gracias por elegir ${studio?.name ?? "nuestro estudio"}. Revisaremos cada detalle y te contactaremos muy pronto para reservar tu fecha.`}
          </p>

          {shortId && (
            <div className="mx-auto mt-6 inline-flex flex-col items-center rounded-2xl border border-border bg-cream-50 px-6 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Código de referencia
              </span>
              <span className="mt-0.5 font-mono text-base font-semibold text-foreground">
                #{shortId}
              </span>
            </div>
          )}

          {/* Progreso */}
          <div className="mx-auto mt-8 flex max-w-sm items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={s.label} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  <div
                    className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : s.state === "todo" ? "bg-border" : "bg-gold-400"}`}
                  />
                  <span
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      s.state === "done"
                        ? "bg-gradient-to-br from-gold-400 to-gold-600 text-white"
                        : s.state === "current"
                          ? "bg-brand-soft text-gold-700 ring-2 ring-gold-400/40"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s.state === "done" ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <div
                    className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? "opacity-0" : s.state === "done" ? "bg-gold-400" : "bg-border"}`}
                  />
                </div>
                <span className="mt-2 text-[10.5px] font-medium leading-tight text-muted-foreground">
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* Próximos pasos */}
          <div className="mt-8 space-y-3 rounded-2xl bg-cream-50 p-5 text-left">
            <NextStep
              icon={<Clock className="h-4 w-4" />}
              title="Tiempo de respuesta"
              text="Solemos contestar en menos de 24 horas."
            />
            <NextStep
              icon={<Mail className="h-4 w-4" />}
              title="Revisa tu correo"
              text="Te enviaremos la confirmación y los siguientes pasos para asegurar tu fecha."
            />
            <NextStep
              icon={<Sparkles className="h-4 w-4" />}
              title="Prepara tu visión"
              text="Piensa en los momentos y detalles que quieres que capturemos."
            />
          </div>

          {(studio?.email || studio?.phone) && (
            <p className="mt-6 text-xs text-muted-foreground">
              ¿Urgente? Escríbenos:{" "}
              {studio.email && (
                <a
                  href={`mailto:${studio.email}`}
                  className="font-medium text-gold-700 hover:underline"
                >
                  {studio.email}
                </a>
              )}
              {studio.email && studio.phone && " · "}
              {studio.phone && (
                <a
                  href={`tel:${studio.phone}`}
                  className="font-medium text-gold-700 hover:underline"
                >
                  {studio.phone}
                </a>
              )}
            </p>
          )}

          <Link
            href={`/p/${params.studio}/${params.pkg}`}
            className="lx-btn-outline mt-7 !py-2.5 text-[13px]"
          >
            Ver paquete nuevamente
          </Link>
        </div>

        <p className="mt-6 text-center text-[11px] tracking-wide text-muted-foreground/60">
          Una experiencia de {studio?.name ?? "PixelOS"}
        </p>
      </div>
    </div>
  )
}

function NextStep({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode
  title: string
  text: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft text-gold-600">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}
