import { Receipt, AlertTriangle, CheckCircle2, Pause, XCircle, Plus } from "lucide-react"
import type { Metadata } from "next"

import { AppTopbar } from "@/components/layout/app-topbar"
import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getNcfSequences,
  getTaxConfig,
} from "@/server/services/fiscal-ncf.service"
import { NCF_TYPE_LABELS, NCF_TYPES, type NcfType } from "@/lib/fiscal"

import { TaxConfigForm } from "./tax-config-form"
import { NcfSequenceForm } from "./ncf-sequence-form"

export const metadata: Metadata = { title: "Configuración fiscal RD" }

export default async function FiscalSettingsPage() {
  const session = await requireStudioAuth()
  const [sequences, taxConfig, unread] = await Promise.all([
    getNcfSequences(session.studioId),
    getTaxConfig(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Fiscal RD — NCF / ITBIS"
        description="RNC del estudio, tasa de ITBIS y secuencias NCF (B01–B17) reglamentadas por DGII."
        unreadNotifications={unread}
      />

      <div className="space-y-6 px-6 py-6 lg:px-8 lg:py-8 max-w-4xl">
        {/* Sección 1: Configuración fiscal del studio */}
        <section className="sf-card p-6">
          <h2 className="font-display text-xl text-foreground mb-1">
            Datos fiscales del estudio
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Estos datos aparecerán en cada factura emitida. El RNC se valida en
            cualquier comprobante que el cliente quiera deducir.
          </p>
          <TaxConfigForm
            initial={{
              itbisRate: taxConfig?.itbis_rate ?? 18,
              isrRetention: taxConfig?.isr_retention ?? undefined,
              rnc: taxConfig?.rnc ?? "",
              businessName: taxConfig?.business_name ?? "",
              defaultNcfType: (taxConfig?.default_ncf_type as NcfType | null) ?? "B02",
            }}
          />
        </section>

        {/* Sección 2: Secuencias NCF */}
        <section className="sf-card p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl text-foreground mb-1">
                Secuencias NCF
              </h2>
              <p className="text-xs text-muted-foreground">
                Cada tipo NCF (B01..B17) tiene un rango asignado por DGII. Solo
                puede haber una secuencia ACTIVA por tipo a la vez — al agotarse,
                se marca EXHAUSTED automáticamente.
              </p>
            </div>
          </div>

          {sequences.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
              <Receipt className="mx-auto mb-2 size-8 text-muted-foreground/60" />
              <p className="text-sm font-medium">Aún no tienes secuencias configuradas</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Solicita rangos a DGII y créalos abajo para empezar a facturar
                con NCF.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sequences.map((seq) => {
                const remaining = seq.range_to - seq.current_value
                const consumed = seq.current_value - seq.range_from + 1
                const consumedPct =
                  seq.range_to > seq.range_from
                    ? Math.round(
                        ((seq.current_value - seq.range_from + 1) /
                          (seq.range_to - seq.range_from + 1)) *
                          100,
                      )
                    : 0
                return (
                  <div
                    key={seq.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <SequenceTypeBadge type={seq.type as NcfType} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold">
                              {seq.prefix}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              rango {seq.range_from} – {seq.range_to}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {NCF_TYPE_LABELS[seq.type as NcfType]}
                            {seq.expires_at &&
                              ` · vence ${new Date(seq.expires_at).toLocaleDateString("es-DO")}`}
                          </p>
                        </div>
                      </div>
                      <SequenceStatusBadge status={seq.status} />
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>
                          {consumed} usados de {seq.range_to - seq.range_from + 1}
                        </span>
                        <span>{remaining} restantes</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={
                            "h-full transition-all " +
                            (consumedPct >= 90
                              ? "bg-red-500"
                              : consumedPct >= 70
                              ? "bg-amber-500"
                              : "bg-emerald-500")
                          }
                          style={{ width: `${Math.min(100, consumedPct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Form para crear nueva secuencia */}
          <div className="mt-6 border-t border-border pt-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Plus className="size-4" />
              Añadir nueva secuencia
            </h3>
            <NcfSequenceForm
              availableTypes={NCF_TYPES.filter(
                (t) =>
                  !sequences.some(
                    (s) => s.type === t && s.status === "ACTIVE",
                  ),
              )}
            />
          </div>
        </section>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Helpers UI
// ---------------------------------------------------------------------------

function SequenceTypeBadge({ type }: { type: NcfType }) {
  return (
    <span className="inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 font-mono text-sm font-bold text-primary">
      {type}
    </span>
  )
}

function SequenceStatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        <CheckCircle2 className="size-3" />
        Activa
      </span>
    )
  }
  if (status === "PAUSED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        <Pause className="size-3" />
        Pausada
      </span>
    )
  }
  // EXHAUSTED
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
      <XCircle className="size-3" />
      Agotada
    </span>
  )
}
