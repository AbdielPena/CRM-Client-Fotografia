import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { headers } from "next/headers"

import {
  getQuoteByToken,
  acceptQuote,
} from "@/server/services/booking-quote.service"
import { getBookingFormConfigBySlug } from "@/server/services/booking-form.service"
import { customFieldName, type BookingFormConfig } from "@/lib/forms/booking-form"

export const metadata: Metadata = { title: "Tu cotización" }
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

/**
 * Página pública de una cotización LIBRE (sin plan de la lista).
 *
 * Las cotizaciones hechas sobre un plan usan el formulario público de ese plan
 * (`/p/[studio]/[pkg]/book?q=`). Las libres no tienen plan —y por tanto no
 * tienen esa ruta—, así que viven aquí: mismo presupuesto a la vista, mismas
 * preguntas configurables del estudio, y al enviar entran EXACTAMENTE al mismo
 * flujo (contrato → firma → factura → portal).
 */

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-900"

function money(n: number, currency: string) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n)
}

async function submit(formData: FormData) {
  "use server"

  const token = String(formData.get("token") ?? "")
  const quote = await getQuoteByToken(token)
  if (!quote) notFound()

  const clientName = String(formData.get("clientName") ?? "").trim()
  const clientEmail = String(formData.get("clientEmail") ?? "").trim()
  if (!clientName || !clientEmail) {
    redirect(`/cotizacion/${token}?error=Completa tu nombre y correo`)
  }

  // Preguntas propias del estudio (las mismas del formulario de reserva).
  const cfg = await getBookingFormConfigBySlug(quote.studioSlug).catch(
    (): BookingFormConfig => ({}),
  )
  const customFields = (cfg.customFields ?? [])
    .map((f) => ({
      key: f.key,
      label: f.label,
      value: String(formData.get(customFieldName(f.key)) ?? "").trim(),
    }))
    .filter((c) => c.value !== "")

  const hdrs = headers()
  const result = await acceptQuote({
    token,
    data: {
      clientName,
      clientEmail,
      clientPhone: String(formData.get("clientPhone") ?? "").trim(),
      clientWhatsapp: String(formData.get("clientPhone") ?? "").trim(),
      eventDate: quote.eventDate,
      eventLocation: String(formData.get("eventLocation") ?? "").trim(),
      additionalNotes: String(formData.get("additionalNotes") ?? "").trim(),
    },
    customFields,
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  })
  if (result.status === "not_found") notFound()
  redirect(`/cotizacion/${token}/listo`)
}

export default async function CotizacionPage({
  params,
  searchParams,
}: {
  params: { token: string }
  searchParams?: { error?: string }
}) {
  const quote = await getQuoteByToken(params.token)
  if (!quote) notFound()

  const cfg = await getBookingFormConfigBySlug(quote.studioSlug).catch(
    (): BookingFormConfig => ({}),
  )
  const customFields = cfg.customFields ?? []
  const total = quote.items.reduce((s, i) => s + i.qty * i.price, 0)

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-2xl px-5">
        <h1 className="text-2xl font-semibold text-gray-900">{quote.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cotización de {quote.studioName} · {quote.eventDate}
        </p>

        {/* Presupuesto */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          {quote.items.length > 0 ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {quote.items.map((it, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-700">
                      {it.concept}
                      {it.qty > 1 && (
                        <span className="text-gray-400"> × {it.qty}</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-900">
                      {money(it.qty * it.price, quote.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="text-sm font-medium text-gray-700">Total</span>
            <span className="text-lg font-semibold text-gray-900">
              {money(quote.amount, quote.currency)}
            </span>
          </div>
          {quote.items.length > 0 && total !== quote.amount && (
            <p className="mt-1 text-right text-[11px] text-gray-400">
              Precio acordado
            </p>
          )}
          {quote.deliverables.length > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Qué incluye
              </p>
              <ul className="mt-2 space-y-1.5">
                {quote.deliverables.map((d, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-gray-700">
                    <span className="text-emerald-600">✓</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {quote.note && (
            <p className="mt-3 rounded-lg bg-gray-50 p-3 text-[13px] text-gray-600">
              {quote.note}
            </p>
          )}
        </div>

        {quote.alreadyAccepted ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Esta cotización ya fue completada. Si necesitas cambiar algo,
            escríbenos y con gusto te ayudamos.
          </div>
        ) : (
          <form
            action={submit}
            className="mt-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-6"
          >
            <input type="hidden" name="token" value={params.token} />
            {searchParams?.error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {decodeURIComponent(searchParams.error)}
              </p>
            )}
            <p className="text-sm font-semibold text-gray-900">
              Completa tus datos para reservar
            </p>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">
                Nombre completo *
              </span>
              <input
                name="clientName"
                defaultValue={quote.clientName}
                className={INPUT}
                required
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">
                  Correo *
                </span>
                <input
                  name="clientEmail"
                  type="email"
                  defaultValue={quote.clientEmail}
                  className={INPUT}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">
                  WhatsApp
                </span>
                <input
                  name="clientPhone"
                  defaultValue={quote.clientPhone ?? ""}
                  className={INPUT}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">
                Lugar
              </span>
              <input name="eventLocation" className={INPUT} />
            </label>

            {customFields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">
                  {f.label}
                  {f.required ? <span className="text-red-500"> *</span> : null}
                </span>
                {f.type === "textarea" ? (
                  <textarea
                    name={customFieldName(f.key)}
                    rows={3}
                    required={f.required}
                    className={INPUT}
                  />
                ) : (
                  <input
                    name={customFieldName(f.key)}
                    required={f.required}
                    placeholder={f.placeholder}
                    className={INPUT}
                  />
                )}
              </label>
            ))}

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">
                ¿Algo más que debamos saber?
              </span>
              <textarea name="additionalNotes" rows={3} className={INPUT} />
            </label>

            <button
              type="submit"
              className="w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Aceptar y reservar mi fecha
            </button>
            <p className="text-center text-[11px] text-gray-400">
              Al enviar recibirás el contrato para firmar.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
