import Link from "next/link"
import {
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Receipt,
  Plus,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinTransactions, type FinTransactionRow } from "@/server/services/fin-transaction.service"
import { formatCurrency, formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/shared/search-input"
import { EmptyState } from "@/components/shared/empty-state"
import { Pagination } from "@/components/shared/pagination"
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableColumn,
  DataTableFooter,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table"

export const metadata: Metadata = { title: "Finanzas · Transacciones" }

const PAGE_SIZE = 50

type SearchParamsShape = {
  q?: string
  page?: string
  tipo?: string
  business?: string
}

type TxWithJoins = FinTransactionRow & {
  categoria?: { id: string; nombre: string; emoji?: string | null; color?: string | null } | null
  cuenta?: { id: string; nombre: string } | null
  cuenta_destino?: { id: string; nombre: string } | null
  tarjeta?: { id: string; nombre: string } | null
  invoice?: { id: string; invoice_number: string; ncf?: string | null } | null
  client?: { id: string; name: string } | null
}

export default async function FinanceTransactionsPage({
  searchParams,
}: {
  searchParams?: SearchParamsShape
}) {
  const session = await requireStudioAuth()

  const search = searchParams?.q?.trim() ?? ""
  const page = Math.max(1, Number(searchParams?.page) || 1)
  const tipo =
    searchParams?.tipo === "ingreso" ||
    searchParams?.tipo === "gasto" ||
    searchParams?.tipo === "transferencia"
      ? searchParams.tipo
      : undefined
  const isBusiness =
    searchParams?.business === "1"
      ? true
      : searchParams?.business === "0"
      ? false
      : undefined

  const [transactions, unread] = await Promise.all([
    getFinTransactions(session.studioId, {
      search: search || undefined,
      tipo,
      isBusiness,
      page,
      pageSize: PAGE_SIZE,
    }),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Transacciones"
        description="Ingresos, gastos y transferencias del estudio. Las invoices pagadas crean ingresos automáticamente vía webhook Stripe."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/finance/transactions/new">
              <Plus className="mr-1 size-4" />
              Nueva transacción
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Search + filters */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Buscar por descripción o notas..." />
          <FilterChip
            href={
              tipo === "ingreso"
                ? buildHref({ ...searchParams, tipo: undefined })
                : buildHref({ ...searchParams, tipo: "ingreso" })
            }
            active={tipo === "ingreso"}
            label="Ingresos"
            icon={<TrendingUp className="size-3" />}
            tone="positive"
          />
          <FilterChip
            href={
              tipo === "gasto"
                ? buildHref({ ...searchParams, tipo: undefined })
                : buildHref({ ...searchParams, tipo: "gasto" })
            }
            active={tipo === "gasto"}
            label="Gastos"
            icon={<TrendingDown className="size-3" />}
            tone="negative"
          />
          <FilterChip
            href={
              tipo === "transferencia"
                ? buildHref({ ...searchParams, tipo: undefined })
                : buildHref({ ...searchParams, tipo: "transferencia" })
            }
            active={tipo === "transferencia"}
            label="Transferencias"
            icon={<ArrowLeftRight className="size-3" />}
            tone="neutral"
          />
          <FilterChip
            href={
              isBusiness === true
                ? buildHref({ ...searchParams, business: undefined })
                : buildHref({ ...searchParams, business: "1" })
            }
            active={isBusiness === true}
            label="Solo negocio"
            tone="neutral"
          />
          <FilterChip
            href={
              isBusiness === false
                ? buildHref({ ...searchParams, business: undefined })
                : buildHref({ ...searchParams, business: "0" })
            }
            active={isBusiness === false}
            label="Solo personal"
            tone="neutral"
          />
        </div>

        {/* Tabla */}
        {transactions.total === 0 ? (
          <EmptyState
            icon={<Receipt className="size-12 text-muted-foreground/60" />}
            title="Aún no hay transacciones"
            description="Las invoices pagadas crean ingresos automáticamente. O regístralos manualmente."
          >
            <Button asChild>
              <Link href="/finance/transactions/new">
                <Plus className="mr-1 size-4" />
                Crear transacción
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableColumn>Fecha</DataTableColumn>
                <DataTableColumn>Descripción</DataTableColumn>
                <DataTableColumn>Categoría</DataTableColumn>
                <DataTableColumn>Cuenta</DataTableColumn>
                <DataTableColumn className="text-right">Monto</DataTableColumn>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {(transactions.items as TxWithJoins[]).map((tx) => {
                const monto = Number(tx.monto)
                const Icon =
                  tx.tipo === "ingreso"
                    ? TrendingUp
                    : tx.tipo === "gasto"
                    ? TrendingDown
                    : ArrowLeftRight
                const colorClass =
                  tx.tipo === "ingreso"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : tx.tipo === "gasto"
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
                const sign = tx.tipo === "ingreso" ? "+" : tx.tipo === "gasto" ? "−" : ""
                return (
                  <DataTableRow key={tx.id} className="hover:bg-accent/30">
                    <DataTableCell className="text-sm text-muted-foreground tabular-nums">
                      {formatDate(new Date(tx.fecha))}
                    </DataTableCell>
                    <DataTableCell>
                      <Link
                        href={`/finance/transactions/${tx.id}`}
                        className="flex items-center gap-2 font-medium hover:underline"
                      >
                        <Icon className={`size-4 shrink-0 ${colorClass}`} />
                        <span className="line-clamp-1">{tx.descripcion ?? "—"}</span>
                        {tx.invoice && (
                          <span
                            className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-mono text-primary"
                            title={`Factura ${tx.invoice.invoice_number}`}
                          >
                            {tx.invoice.ncf ?? tx.invoice.invoice_number}
                          </span>
                        )}
                      </Link>
                      {tx.client?.name && (
                        <p className="ml-6 text-xs text-muted-foreground">
                          {tx.client.name}
                        </p>
                      )}
                    </DataTableCell>
                    <DataTableCell>
                      {tx.categoria ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
                          style={
                            tx.categoria.color
                              ? { backgroundColor: tx.categoria.color + "20", color: tx.categoria.color }
                              : undefined
                          }
                        >
                          {tx.categoria.emoji && <span>{tx.categoria.emoji}</span>}
                          {tx.categoria.nombre}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-sm text-muted-foreground">
                      {tx.tipo === "transferencia" && tx.cuenta && tx.cuenta_destino
                        ? `${tx.cuenta.nombre} → ${tx.cuenta_destino.nombre}`
                        : tx.cuenta?.nombre ?? tx.tarjeta?.nombre ?? "—"}
                    </DataTableCell>
                    <DataTableCell className={`text-right tabular-nums font-semibold ${colorClass}`}>
                      {sign}
                      {formatCurrency(monto, tx.currency)}
                    </DataTableCell>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
            <DataTableFooter>
              <Pagination
                page={transactions.page}
                totalPages={transactions.totalPages}
                total={transactions.total}
                pageSize={transactions.pageSize}
                baseHref="/finance/transactions"
                preserveQuery={{
                  q: search || undefined,
                  tipo: tipo || undefined,
                  business: searchParams?.business || undefined,
                }}
                itemsLabel="transacciones"
              />
            </DataTableFooter>
          </DataTable>
        )}
      </main>
    </>
  )
}

function FilterChip({
  href,
  active,
  label,
  icon,
  tone = "neutral",
}: {
  href: string
  active: boolean
  label: string
  icon?: React.ReactNode
  tone?: "positive" | "negative" | "neutral"
}) {
  const activeClass =
    tone === "positive"
      ? "border-emerald-500 bg-emerald-500 text-white"
      : tone === "negative"
      ? "border-red-500 bg-red-500 text-white"
      : "border-primary bg-primary text-primary-foreground"
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? activeClass
          : "border-input bg-background text-muted-foreground hover:bg-accent")
      }
    >
      {icon}
      {label}
    </Link>
  )
}

function buildHref(params: SearchParamsShape): string {
  const usp = new URLSearchParams()
  if (params.q) usp.set("q", params.q)
  if (params.page) usp.set("page", params.page)
  if (params.tipo) usp.set("tipo", params.tipo)
  if (params.business) usp.set("business", params.business)
  const qs = usp.toString()
  return `/finance/transactions${qs ? `?${qs}` : ""}`
}
