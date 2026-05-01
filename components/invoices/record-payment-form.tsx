"use client"

import { useState, useTransition } from "react"
import { recordPaymentAction } from "@/server/actions/invoice.actions"
import { formatCurrency } from "@/lib/utils/currency"
import { toast } from "sonner"
import { CreditCard } from "lucide-react"

// Valores válidos del enum payment_method en Supabase
const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Transferencia bancaria" },
  { value: "cash", label: "Efectivo" },
  { value: "check", label: "Cheque" },
  { value: "azul", label: "Azul (RD)" },
  { value: "cardnet", label: "CardNet (RD)" },
  { value: "zelle", label: "Zelle" },
  { value: "paypal", label: "PayPal" },
  { value: "stripe", label: "Stripe / Tarjeta online" },
  { value: "other", label: "Otro" },
]

interface RecordPaymentFormProps {
  invoiceId: string
  balance: number
  currency: string
}

export function RecordPaymentForm({ invoiceId, balance, currency }: RecordPaymentFormProps) {
  const [amount, setAmount] = useState(balance)
  const [isPending, startTransition] = useTransition()
  const [success, setSuccess] = useState(false)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = (await recordPaymentAction(invoiceId, fd)) as {
        success?: boolean
        error?: string
      }
      if (result?.success) {
        toast.success("Pago registrado correctamente")
        setSuccess(true)
      } else if (result?.error) {
        toast.error(result.error)
      }
    })
  }

  if (success) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
        <p className="text-sm font-semibold text-emerald-700">✓ Pago registrado</p>
        <button
          onClick={() => setSuccess(false)}
          className="text-xs text-emerald-600 hover:underline mt-1"
        >
          Registrar otro pago
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">Registrar pago</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Monto (saldo: {formatCurrency(balance, currency)})
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
              className="w-full pl-7 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Método de pago
          </label>
          <select
            name="method"
            required
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Fecha de pago</label>
          <input
            name="paidAt"
            type="date"
            defaultValue={new Date().toISOString().split("T")[0]}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Referencia / Comprobante
          </label>
          <input
            name="reference"
            type="text"
            placeholder="Número de transferencia, etc."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {isPending ? "Guardando..." : "Registrar pago"}
        </button>
      </form>
    </div>
  )
}
