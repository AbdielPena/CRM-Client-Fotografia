"use client"

import * as React from "react"
import Link from "next/link"

import { AssignAccountCell, type AccountOption } from "@/components/finance/assign-account-cell"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"

/**
 * Los pagos recientes, cortos por defecto.
 *
 * Antes salían los últimos cien de un tirón: una tabla que se comía la pantalla
 * y dejaba todo lo demás fuera de vista. Lo normal es mirar los de esta semana;
 * el resto se pide cuando se necesita.
 */

const METODOS: Record<string, string> = {
  bank_transfer: "Transferencia",
  cash: "Efectivo",
  check: "Cheque",
  azul: "Azul",
  cardnet: "CardNet",
  zelle: "Zelle",
  paypal: "PayPal",
  stripe: "Stripe",
  other: "Otro",
}

const DE_ENTRADA = 12

export interface PaymentRow {
  id: string
  amount: number
  currency: string
  method: string
  receivedAt: string
  invoiceId: string
  invoiceNumber: string | null
  clientName: string | null
  finanzappAccountId: string | null
  finanzappAccountName: string | null
  pending: boolean
}

export function RecentPaymentsTable({
  payments,
  accounts,
}: {
  payments: PaymentRow[]
  accounts: AccountOption[]
}) {
  const [todos, setTodos] = React.useState(false)
  const visibles = todos ? payments : payments.slice(0, DE_ENTRADA)
  const ocultos = payments.length - visibles.length

  if (payments.length === 0) {
    return (
      <div className="sf-card px-5 py-10 text-center text-sm text-muted-foreground">
        Aún no hay pagos registrados.
      </div>
    )
  }

  return (
    <div className="sf-card overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold text-foreground">Pagos recientes</h3>
        <span className="text-[11.5px] text-muted-foreground">
          {visibles.length} de {payments.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left font-medium">Fecha</th>
              <th className="px-5 py-2 text-left font-medium">Cliente</th>
              <th className="px-5 py-2 text-right font-medium">Monto</th>
              <th className="px-5 py-2 text-left font-medium">Cuenta destino</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {visibles.map((p) => (
              <tr
                key={p.id}
                className={p.pending ? "bg-amber-50/30" : "hover:bg-muted/30"}
              >
                <td className="whitespace-nowrap px-5 py-2 text-[12.5px] text-foreground/80">
                  {formatDateShort(new Date(p.receivedAt))}
                </td>
                <td className="px-5 py-2">
                  <p className="text-[13px] text-foreground/80">
                    {p.clientName ?? "—"}
                  </p>
                  <Link
                    href={`/invoices/${p.invoiceId}`}
                    className="font-mono text-[11px] text-primary hover:underline"
                  >
                    {p.invoiceNumber ?? p.invoiceId.slice(0, 8)}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-5 py-2 text-right">
                  <p className="font-medium tabular-nums text-foreground">
                    {formatCurrency(p.amount, p.currency)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {METODOS[p.method] ?? p.method}
                  </p>
                </td>
                <td className="px-5 py-2">
                  <AssignAccountCell
                    paymentId={p.id}
                    currentAccountId={p.finanzappAccountId}
                    currentLabel={p.finanzappAccountName}
                    accounts={accounts}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ocultos > 0 || todos ? (
        <button
          type="button"
          onClick={() => setTodos((v) => !v)}
          className="w-full border-t border-border px-5 py-2.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          {todos ? "Mostrar menos" : `Ver los otros ${ocultos}`}
        </button>
      ) : null}
    </div>
  )
}
