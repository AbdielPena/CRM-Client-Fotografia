import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  getQuoteDetail,
  eventSummary,
} from "@/server/services/booking-quote.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { QuoteDetailActions } from "@/components/quotes/quote-detail-actions"
import { formatCurrency } from "@/lib/utils/currency"

export const metadata: Metadata = { title: "Cotización · StudioFlow" }

// El estado cambia en cuanto el cliente acepta: nunca desde caché.
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

/** `2026-11-06` → `06 de noviembre de 2026`, sin correrse un día en RD. */
function fechaLarga(dateOnly: string) {
  if (!dateOnly) return "—"
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateOnly.slice(0, 10)}T00:00:00Z`))
}

function fechaHora(iso: string | null) {
  if (!iso) return null
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

export default async function CotizacionDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const q = await getQuoteDetail(session.studioId, params.id)
  if (!q) notFound()

  const aceptada = !!q.acceptedAt
  const anulada = q.status === "cancelled"
  const itemsTotal = q.items.reduce((s, i) => s + i.qty * i.price, 0)
  const eventosTotal = q.events.reduce((s, e) => s + (e.amount ?? 0), 0)
  const desglose = itemsTotal + eventosTotal

  return (
    <>
      <AppTopbar
        eyebrow="Cotizaciones"
        title={q.title}
        description={`${q.clientName} · ${q.clientEmail}`}
      />

      <div className="space-y-4 p-6">
        <Link
          href="/cotizaciones"
          prefetch={false}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Todas las cotizaciones
        </Link>

        {/* Estado: lo primero que hay que saber al abrirla. */}
        <div className="sf-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {aceptada
                  ? "Aceptada"
                  : anulada
                    ? "Anulada"
                    : "Esperando al cliente"}
              </p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                {formatCurrency(q.amount, q.currency)}
              </p>
              {desglose > 0 && desglose !== q.amount && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  El desglose suma {formatCurrency(desglose, q.currency)} — este
                  es el precio acordado.
                </p>
              )}
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              {q.sentAt && <p>Enviada el {fechaHora(q.sentAt)}</p>}
              {q.acceptedAt && (
                <p className="text-emerald-600 dark:text-emerald-400">
                  Aceptada el {fechaHora(q.acceptedAt)}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4">
            <QuoteDetailActions
              quoteId={q.id}
              url={q.url}
              clientName={q.clientName}
              clientEmail={q.clientEmail}
              editable={q.editable && !anulada}
            />
          </div>

          {aceptada && q.projectId && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              El cliente ya la aceptó: tiene su contrato y su factura. Lo que
              siga se maneja desde la sesión.{" "}
              <Link
                href={`/projects/${q.projectId}`}
                prefetch={false}
                className="font-semibold underline"
              >
                Ver la sesión
              </Link>
            </div>
          )}
          {!aceptada && !anulada && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Mientras no la acepte se puede reenviar o anular. En cuanto la
              acepta nace la sesión con su contrato y su factura.
            </p>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            {/* Las fechas del trabajo. */}
            {q.events.length > 0 && (
              <div className="sf-card p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {q.events.length > 1 ? "Fechas" : "Fecha"}
                </h2>
                <ul className="mt-3 space-y-3">
                  {q.events.map((e) => {
                    const detalle = eventSummary(e)
                    return (
                      <li
                        key={e.id}
                        className="flex flex-wrap items-start justify-between gap-3 border-l-2 border-border pl-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {e.name}
                            {e.isPrimary && q.events.length > 1 && (
                              <span className="ml-1.5 text-[10px] font-semibold text-brand">
                                · principal
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {fechaLarga(e.eventDate)}
                              {e.eventTime ? ` · ${e.eventTime}` : ""}
                            </span>
                            {e.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {e.location}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {e.packageName ?? "Cotizado aparte"}
                            {detalle.length > 0
                              ? ` · ${detalle.join(" · ")}`
                              : ""}
                          </p>
                        </div>
                        {e.amount != null && e.amount > 0 && (
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                            {formatCurrency(e.amount, q.currency)}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* El presupuesto libre. */}
            {q.items.length > 0 && (
              <div className="sf-card p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Otras líneas
                </h2>
                <table className="mt-3 w-full text-sm">
                  <tbody className="divide-y divide-border/60">
                    {q.items.map((it, i) => (
                      <tr key={i}>
                        <td className="py-1.5 text-foreground/85">
                          {it.concept}
                          {it.qty > 1 && (
                            <span className="text-muted-foreground">
                              {" "}
                              × {it.qty}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-foreground">
                          {formatCurrency(it.qty * it.price, q.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {q.deliverables.length > 0 && (
              <div className="sf-card p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Qué incluye
                </h2>
                <ul className="mt-3 space-y-1.5">
                  {q.deliverables.map((d, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-foreground/85">
                      <span className="text-emerald-600">✓</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="sf-card p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cliente
              </h2>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Nombre</dt>
                  <dd className="text-right font-medium text-foreground">
                    {q.clientName}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Correo</dt>
                  <dd className="break-all text-right text-foreground/85">
                    {q.clientEmail}
                  </dd>
                </div>
                {q.clientPhone && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">WhatsApp</dt>
                    <dd className="text-right text-foreground/85">
                      {q.clientPhone}
                    </dd>
                  </div>
                )}
                {q.eventLocation && (
                  <div className="flex justify-between gap-3 border-t border-border/60 pt-2">
                    <dt className="text-muted-foreground">Lugar</dt>
                    <dd className="text-right text-foreground/85">
                      {q.eventLocation}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {(q.note || q.additionalNotes) && (
              <div className="sf-card p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Notas
                </h2>
                {q.note && (
                  <div className="mt-3">
                    <p className="text-[11px] text-muted-foreground">
                      Lo que le escribiste
                    </p>
                    <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-2.5 text-[12px] leading-relaxed text-foreground/85">
                      {q.note}
                    </p>
                  </div>
                )}
                {q.additionalNotes && (
                  <div className="mt-3">
                    <p className="text-[11px] text-muted-foreground">
                      Lo que él pidió al aceptar
                    </p>
                    <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-2.5 text-[12px] leading-relaxed text-foreground/85">
                      {q.additionalNotes}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
