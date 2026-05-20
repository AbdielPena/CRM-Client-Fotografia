import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Repeat,
  Calendar,
  CreditCard,
  CheckCircle2,
  PauseCircle,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinSubscriptionById } from "@/server/services/fin-subscription.service"
import { formatCurrency, formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { SubscriptionActions } from "./subscription-actions"

export const metadata: Metadata = { title: "Suscripción · Finanzas" }

const FRECUENCIA_LABELS: Record<string, string> = {
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
}

export default async function SubscriptionDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()

  const [sub, unread] = await Promise.all([
    getFinSubscriptionById(session.studioId, params.id),
    countUnreadNotifications(session.studioId),
  ])

  if (!sub) notFound()

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas / Suscripciones"
        title={sub.nombre}
        description={`${FRECUENCIA_LABELS[sub.frecuencia] ?? sub.frecuencia} · ${formatCurrency(Number(sub.monto))}`}
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/finance/subscriptions">
              <ArrowLeft className="mr-1 size-3.5" />
              Suscripciones
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Status banner */}
        <div
          className={
            "flex items-center justify-between rounded-xl border px-4 py-3 text-sm " +
            (sub.activa
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400")
          }
        >
          <div className="flex items-center gap-2">
            {sub.activa ? (
              <>
                <CheckCircle2 className="size-4" />
                <span>
                  Activa · próximo cobro:{" "}
                  <strong>
                    {sub.proxima_fecha
                      ? formatDate(new Date(sub.proxima_fecha))
                      : "—"}
                  </strong>
                </span>
              </>
            ) : (
              <>
                <PauseCircle className="size-4" />
                <span>Pausada — sin cobros automáticos</span>
              </>
            )}
          </div>
        </div>

        {/* Detalles */}
        <section className="sf-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-4">
          <KV
            label={
              <>
                <Repeat className="mr-1 inline size-3" />
                Frecuencia
              </>
            }
          >
            <span>
              {FRECUENCIA_LABELS[sub.frecuencia] ?? sub.frecuencia}
            </span>
          </KV>
          <KV label="Monto por cobro">
            <span className="tabular-nums">
              {formatCurrency(Number(sub.monto))} {sub.currency}
            </span>
          </KV>
          <KV
            label={
              <>
                <Calendar className="mr-1 inline size-3" />
                Día del mes
              </>
            }
          >
            <span>{sub.dia_cobro ?? "—"}</span>
          </KV>
          <KV
            label={
              <>
                <CreditCard className="mr-1 inline size-3" />
                Cobrado a
              </>
            }
          >
            <span>
              {sub.cuenta?.nombre ?? sub.tarjeta?.descripcion ?? "—"}
            </span>
          </KV>
          {sub.categoria && (
            <KV label="Categoría">
              <span>{sub.categoria.nombre}</span>
            </KV>
          )}
        </section>

        {/* Acciones */}
        <SubscriptionActions
          subscriptionId={sub.id}
          isActive={sub.activa}
          proximaFecha={sub.proxima_fecha}
        />

        {/* Histórico de cargos */}
        <section className="sf-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Histórico de cargos ({sub.charges?.length ?? 0})
          </h3>
          {(sub.charges ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay cargos procesados. El cron diario crea automáticamente
              el primer cargo cuando llegue la fecha próxima.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {sub.charges!.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {formatDate(new Date(c.fecha))}
                    </p>
                    {c.transaction && (
                      <Link
                        href={`/finance/transactions/${c.transaction.id}`}
                        className="text-[10px] text-primary hover:underline"
                      >
                        Ver transacción →
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-medium">
                      {formatCurrency(Number(c.monto))}
                    </span>
                    {c.pagado ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        Procesado
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        Pendiente
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  )
}

function KV({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}
