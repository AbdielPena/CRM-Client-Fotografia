"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { createInvoiceAction } from "@/server/actions/invoice.actions"

interface Project {
  id: string
  name: string
  clientId: string
  clientName: string
  totalAmount?: number
  currency: string
}

interface Client {
  id: string
  name: string
}

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
}

interface InvoiceBuilderProps {
  projects: Project[]
  clients: Client[]
  defaultProjectId?: string
  defaultClientId?: string
}

export function InvoiceBuilder({
  projects,
  clients,
  defaultProjectId,
  defaultClientId,
}: InvoiceBuilderProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId ?? "")
  const [selectedClientId, setSelectedClientId] = useState(defaultClientId ?? "")
  const [currency, setCurrency] = useState("USD")
  const [discount, setDiscount] = useState(0)
  const [depositPercent, setDepositPercent] = useState(0)
  const [items, setItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0, taxRate: 0 },
  ])
  const [isPending, startTransition] = useTransition()

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  // Auto-fill client when project is selected
  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId)
    const proj = projects.find((p) => p.id === projectId)
    if (proj) {
      setSelectedClientId(proj.clientId)
      if (proj.currency) setCurrency(proj.currency)
      if (proj.totalAmount) {
        setItems([
          { description: `Sesión fotográfica — ${proj.name}`, quantity: 1, unitPrice: proj.totalAmount, taxRate: 0 },
        ])
      }
    }
  }

  const addItem = () => {
    setItems([...items, { description: "", quantity: 1, unitPrice: 0, taxRate: 0 }])
  }

  const removeItem = (idx: number) => {
    if (items.length === 1) return
    setItems(items.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setItems(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)))
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const discountAmount = (subtotal * discount) / 100
  const tax = items.reduce(
    (s, i) => s + i.quantity * i.unitPrice * (i.taxRate / 100),
    0
  )
  const total = subtotal - discountAmount + tax
  const depositAmount = (total * depositPercent) / 100

  const fmt = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(n)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    startTransition(async () => {
      await createInvoiceAction(fd)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
      {/* Project + Client */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Proyecto <span className="text-red-500">*</span>
          </label>
          <select
            name="projectId"
            required
            value={selectedProjectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
          >
            <option value="">Seleccionar proyecto...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.clientName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cliente <span className="text-red-500">*</span>
          </label>
          <select
            name="clientId"
            required
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
          >
            <option value="">Seleccionar cliente...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de vencimiento</label>
          <input
            name="dueDate"
            type="date"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
          <select
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
          >
            <option value="USD">USD — Dólar</option>
            <option value="MXN">MXN — Peso mexicano</option>
            <option value="EUR">EUR — Euro</option>
            <option value="COP">COP — Peso colombiano</option>
            <option value="ARS">ARS — Peso argentino</option>
          </select>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Ítems</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-1/2">
                  Descripción
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 w-16">
                  Qty
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 w-28">
                  Precio unit.
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 w-16">
                  IVA %
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 w-28">
                  Importe
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2">
                    <input
                      name="item_description"
                      value={item.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                      placeholder="Descripción del servicio..."
                      className="w-full text-sm bg-transparent focus:outline-none"
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      name="item_quantity"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                      className="w-full text-sm text-right bg-transparent focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      name="item_unitPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(idx, "unitPrice", Number(e.target.value))}
                      className="w-full text-sm text-right bg-transparent focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      name="item_taxRate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={item.taxRate}
                      onChange={(e) => updateItem(idx, "taxRate", Number(e.target.value))}
                      className="w-full text-sm text-right bg-transparent focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700 font-medium text-sm whitespace-nowrap">
                    {fmt(item.quantity * item.unitPrice)}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus className="h-4 w-4" />
            Agregar ítem
          </button>
        </div>

        {/* Totals */}
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
          <div className="flex justify-end">
            <div className="w-72 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-900">{fmt(subtotal)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-500">Descuento</span>
                <div className="flex items-center gap-2">
                  <input
                    name="discount"
                    type="number"
                    min="0"
                    max="100"
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="w-14 text-sm text-right border border-gray-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <span className="text-gray-400 text-xs">%</span>
                  {discount > 0 && (
                    <span className="text-red-500 text-xs">-{fmt(discountAmount)}</span>
                  )}
                </div>
              </div>

              {tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Impuestos</span>
                  <span className="text-gray-900">{fmt(tax)}</span>
                </div>
              )}

              <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold text-base">
                <span>Total</span>
                <span>{fmt(total)}</span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-gray-500 text-xs">Depósito requerido</span>
                <div className="flex items-center gap-2">
                  <input
                    name="depositPercent"
                    type="number"
                    min="0"
                    max="100"
                    value={depositPercent}
                    onChange={(e) => setDepositPercent(Number(e.target.value))}
                    className="w-14 text-sm text-right border border-gray-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <span className="text-gray-400 text-xs">%</span>
                  {depositPercent > 0 && (
                    <span className="text-emerald-600 font-medium text-xs">{fmt(depositAmount)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notes + Footer */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notas para el cliente
          </label>
          <textarea
            name="notes"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
            placeholder="Ej. Gracias por confiar en nosotros. Los pagos pueden realizarse vía transferencia..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pie de factura
          </label>
          <textarea
            name="footer"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
            placeholder="Términos y condiciones, información bancaria, etc."
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {isPending ? "Creando..." : "Crear factura"}
        </button>
        <a
          href="/invoices"
          className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  )
}
