import Link from "next/link"
import { Wallet, Plus, Landmark, TrendingUp } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getFinAccountsWithBalances,
  getFinBanks,
} from "@/server/services/fin-account.service"
import { formatCurrency } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"

export const metadata: Metadata = { title: "Finanzas · Cuentas" }

export default async function FinanceAccountsPage() {
  const session = await requireStudioAuth()

  const [accounts, banks, unread] = await Promise.all([
    getFinAccountsWithBalances(session.studioId, { activaOnly: true }),
    getFinBanks(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  // Agregado por currency (un studio puede tener cuentas en DOP y USD)
  const totalsByCurrency = accounts.reduce<Record<string, number>>((acc, a) => {
    acc[a.currency] = (acc[a.currency] ?? 0) + a.balance
    return acc
  }, {})

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Cuentas"
        description="Cuentas bancarias y efectivo del estudio. El balance se calcula de saldo inicial + transacciones."
        unreadNotifications={unread}
        actions={
          <Button asChild disabled={banks.length === 0}>
            <Link href={banks.length > 0 ? "/finance/accounts/new" : "#"}>
              <Plus className="mr-1 size-4" />
              Nueva cuenta
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Resumen totales por currency */}
        {accounts.length > 0 && (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(totalsByCurrency).map(([currency, total]) => (
              <div key={currency} className="sf-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Balance total {currency}
                  </span>
                  <TrendingUp className={total >= 0 ? "size-4 text-emerald-500" : "size-4 text-red-500"} />
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight">
                  {formatCurrency(total, currency)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {accounts.filter((a) => a.currency === currency).length} cuenta(s)
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Banco prompt si no hay */}
        {banks.length === 0 && (
          <div className="sf-card mb-6 flex items-center gap-3 border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
            <Landmark className="size-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                No has registrado bancos todavía
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Cada cuenta pertenece a un banco. Crea uno primero desde el form
                de nueva cuenta (Banreservas, BHD, Popular, Efectivo, etc).
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/finance/accounts/new">
                <Plus className="mr-1 size-3" />
                Empezar
              </Link>
            </Button>
          </div>
        )}

        {/* Lista de cuentas */}
        {accounts.length === 0 ? (
          <EmptyState
            icon={<Wallet className="size-12 text-muted-foreground/60" />}
            title="Aún no tienes cuentas registradas"
            description="Crea cuentas bancarias o de efectivo para rastrear tus saldos y vincular transacciones."
          >
            <Button asChild>
              <Link href="/finance/accounts/new">
                <Plus className="mr-1 size-4" />
                Crear primera cuenta
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {accounts.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}

function AccountCard({
  account,
}: {
  account: Awaited<ReturnType<typeof getFinAccountsWithBalances>>[number]
}) {
  const banco = account.banco
  const bgColor = banco?.color ?? "#6366F1"

  return (
    <Link
      href={`/finance/accounts/${account.id}`}
      className="sf-card group relative overflow-hidden p-5 transition-shadow hover:shadow-md"
    >
      {/* Glow del banco */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full opacity-10 blur-3xl transition-opacity group-hover:opacity-20"
        style={{ backgroundColor: bgColor }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
            style={{ backgroundColor: bgColor }}
            aria-hidden
          >
            {banco?.icono ? (
              <span className="text-base">{banco.icono}</span>
            ) : (
              <Landmark className="size-5" />
            )}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold leading-tight text-foreground">
              {account.nombre}
            </h3>
            <p className="text-xs text-muted-foreground">
              {banco?.nombre ?? "Sin banco"}
              {account.tipo && ` · ${account.tipo}`}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Balance
        </p>
        <p
          className={
            "text-2xl font-bold tabular-nums " +
            (account.balance < 0
              ? "text-red-600 dark:text-red-400"
              : "text-foreground")
          }
        >
          {formatCurrency(account.balance, account.currency)}
        </p>
        {Number(account.saldo_inicial) !== account.balance && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Inicial:{" "}
            <span className="tabular-nums">
              {formatCurrency(Number(account.saldo_inicial), account.currency)}
            </span>
          </p>
        )}
      </div>
    </Link>
  )
}
