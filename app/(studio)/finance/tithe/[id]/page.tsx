import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  HeartHandshake,
  CheckCircle2,
  Calculator,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { untypedServer } from "@/server/supabase/untyped"
import { formatCurrency, formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { MarkPaidForm } from "./mark-paid-form"

export const metadata: Metadata = { title: "Diezmo · Finanzas" }

export default async function TitheDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const sb = untypedServer()

  const [titheRes, accountsRes, categoriesRes, unread] = await Promise.all([
    sb
      .from("fin_tithe")
      .select(
        `*,
         transaction:fin_transactions(id, descripcion, fecha, monto)`,
      )
      .eq("id", params.id)
      .eq("studio_id", session.studioId)
      .maybeSingle(),
    sb
      .from("fin_accounts")
      .select("id, nombre, currency")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("nombre")
      .limit(50),
    sb
      .from("fin_categories")
      .select("id, nombre, tipo")
      .eq("studio_id", session.studioId)
      .eq("tipo", "gasto")
      .is("deleted_at", null)
      .order("nombre")
      .limit(100),
    countUnreadNotifications(session.studioId),
  ])

  if (!titheRes.data) notFound()

  type TitheRow = {
    id: string
    fecha: string
    base_calculo: number | string
    monto_diezmo: number | string
    pagado: boolean
    fecha_pago: string | null
    notas: string | null
    transaction?: {
      id: string
      descripcion: string
      fecha: string
      monto: number | string
    } | null
  }
  const tithe = titheRes.data as TitheRow
  const accounts = (accountsRes.data ?? []) as Array<{
    id: string
    nombre: string
    currency: string
  }>
  const categories = (categoriesRes.data ?? []) as Array<{
    id: string
    nombre: string
    tipo: string
  }>

  const periodLabel = tithe.fecha.slice(0, 7)

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas / Diezmo"
        title={`Diezmo ${periodLabel}`}
        description={
          tithe.pagado
            ? `Pagado el ${tithe.fecha_pago ? formatDate(new Date(tithe.fecha_pago)) : "—"}`
            : "Pendiente de pago"
        }
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/finance/tithe">
              <ArrowLeft className="mr-1 size-3.5" />
              Diezmos
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Resumen */}
        <section className="sf-card grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
          <KV
            label={
              <>
                <Calculator className="mr-1 inline size-3" />
                Base de cálculo
              </>
            }
          >
            <span className="tabular-nums text-sm">
              {formatCurrency(Number(tithe.base_calculo))}
            </span>
          </KV>
          <KV
            label={
              <>
                <HeartHandshake className="mr-1 inline size-3" />
                Diezmo (10%)
              </>
            }
          >
            <span className="tabular-nums text-lg font-semibold">
              {formatCurrency(Number(tithe.monto_diezmo))}
            </span>
          </KV>
          <KV label="Estado">
            {tithe.pagado ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckCircle2 className="size-3" />
                Pagado
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                Pendiente
              </span>
            )}
          </KV>
        </section>

        {/* Form mark paid */}
        {!tithe.pagado && (
          <MarkPaidForm
            titheId={tithe.id}
            montoDiezmo={Number(tithe.monto_diezmo)}
            accounts={accounts}
            categories={categories}
          />
        )}

        {/* Si está pagado, mostrar info */}
        {tithe.pagado && (
          <section className="sf-card p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Detalles del pago
            </h3>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] uppercase text-muted-foreground">
                  Fecha de pago
                </dt>
                <dd>
                  {tithe.fecha_pago
                    ? formatDate(new Date(tithe.fecha_pago))
                    : "—"}
                </dd>
              </div>
              {tithe.transaction && (
                <div>
                  <dt className="text-[10px] uppercase text-muted-foreground">
                    Transacción vinculada
                  </dt>
                  <dd>
                    <Link
                      href={`/finance/transactions/${tithe.transaction.id}`}
                      className="text-primary hover:underline"
                    >
                      {tithe.transaction.descripcion} →
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
            {tithe.notas && (
              <div className="mt-3">
                <dt className="text-[10px] uppercase text-muted-foreground">
                  Notas
                </dt>
                <dd className="text-sm">{tithe.notas}</dd>
              </div>
            )}
          </section>
        )}
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
      <div className="mt-0.5">{children}</div>
    </div>
  )
}
