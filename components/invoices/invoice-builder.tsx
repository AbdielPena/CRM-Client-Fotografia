"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2 } from "lucide-react"
import { createInvoiceAction, updateInvoiceAction } from "@/server/actions/invoice.actions"
import { toast } from "sonner"

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

export interface InvoiceBuilderInitial {
  projectName?: string
  clientName?: string
  dueDate?: string
  currency?: string
  discount?: number
  depositPercent?: number
  notes?: string
  items?: LineItem[]
}

interface InvoiceBuilderProps {
  projects: Project[]
  clients: Client[]
  defaultProjectId?: string
  defaultClientId?: string
  /** "create" (default) o "edit". En edit el proyecto/cliente son fijos. */
  mode?: "create" | "edit"
  invoiceId?: string
  invoiceNumber?: string
  initial?: InvoiceBuilderInitial
}

const CURRENCIES = [
  { value: "DOP", label: "DOP — Peso dominicano" },
  { value: "USD", label: "USD — Dólar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "MXN", label: "MXN — Peso mexicano" },
  { value: "COP", label: "COP — Peso colombiano" },
  { value: "ARS", label: "ARS — Peso argentino" },
]

export function InvoiceBuilder({
  projects,
  clients,
  defaultProjectId,
  defaultClientId,
  mode = "create",
  invoiceId,
  invoiceNumber,
  initial,
}: InvoiceBuilderProps) {
  const isEdit = mode === "edit"

  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId ?? "")
  const [selectedClientId, setSelectedClientId] = useState(defaultClientId ?? "")
  const [currency, setCurrency] = useState(initial?.currency ?? "DOP")
  const [discount, setDiscount] = useState(initial?.discount ?? 0)
  const [depositPercent, setDepositPercent] = useState(initial?.depositPercent ?? 0)
  const [items, setItems] = useState<LineItem[]>(
    initial?.items && initial.items.length > 0
      ? initial.items
      : [{ description: "", quantity: 1, unitPrice: 0, taxRate: 0 }],
  )
  const [isPending, startTransition] = useTransition()

  // Auto-fill client when project is selected (solo en modo crear)
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
    new Intl.NumberFormat("es-DO", { style: "currency", currency }).format(n)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      if (isEdit && invoiceId) {
        const result = (await updateInvoiceAction(invoiceId, fd)) as
          | { error?: string }
          | undefined
        // updateInvoiceAction redirige en éxito; solo llega aquí si hubo error
        if (result?.error) toast.error(result.error)
      } else {
        await createInvoiceAction(fd)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
      {/* Project + Client */}
      <div className="bg-card rounded-xl border border-border p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {isEdit ? (
          <>
            <div>
              <p className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                Proyecto
              </p>
              <p className="text-sm font-medium text-foreground">
                {initial?.projectName ?? "—"}
              </p>
            </div>
            <div>
              <p className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                Cliente
              </p>
              <p className="text-sm font-medium text-foreground">
                {initial?.clientName ?? "—"}
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Proyecto <span className="text-danger">*</span>
              </label>
              <select
                name="projectId"
                required
                value={selectedProjectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-card"
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
              <label className="block text-sm font-medium text-foreground mb-1">
                Cliente <span className="text-danger">*</span>
              </label>
              <select
                name="clientId"
                required
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-card"
              >
                <option value="">Seleccionar cliente...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Fecha de vencimiento</label>
          <input
            name="dueDate"
            type="date"
            defaultValue={initial?.dueDate ?? ""}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Moneda</label>
          <select
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-card"
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Ítems</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-1/2">
                  Descripción
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground w-16">
                  Qty
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground w-28">
                  Precio unit.
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground w-16">
                  IVA %
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground w-28">
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
                  <td className="px-3 py-2 text-right text-foreground font-medium text-sm whitespace-nowrap">
                    {fmt(item.quantity * item.unitPrice)}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      className="p-1 text-muted-foreground hover:text-danger transition-colors disabled:opacity-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1.5 text-sm text-brand hover:text-brand font-medium"
          >
            <Plus className="h-4 w-4" />
            Agregar ítem
          </button>
        </div>

        {/* Totals */}
        <div className="border-t border-border px-5 py-4 bg-muted">
          <div className="flex justify-end">
            <div className="w-72 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground">{fmt(subtotal)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Descuento</span>
                <div className="flex items-center gap-2">
                  <input
                    name="discount"
                    type="number"
                    min="0"
                    max="100"
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="w-14 text-sm text-right border border-border rounded px-2 py-0.5 bg-card focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <span className="text-muted-foreground text-xs">%</span>
                  {discount > 0 && (
                    <span className="text-danger text-xs">-{fmt(discountAmount)}</span>
                  )}
                </div>
              </div>

              {tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Impuestos</span>
                  <span className="text-foreground">{fmt(tax)}</span>
                </div>
              )}

              <div className="flex justify-between pt-2 border-t border-border font-semibold text-base">
                <span>Total</span>
                <span>{fmt(total)}</span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-muted-foreground text-xs">Reserva / depósito</span>
                <div className="flex items-center gap-2">
                  <input
                    name="depositPercent"
                    type="number"
                    min="0"
                    max="100"
                    value={depositPercent}
                    onChange={(e) => setDepositPercent(Number(e.target.value))}
                    className="w-14 text-sm text-right border border-border rounded px-2 py-0.5 bg-card focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <span className="text-muted-foreground text-xs">%</span>
                  {depositPercent > 0 && (
                    <span className="text-emerald-600 font-medium text-xs">{fmt(depositAmount)}</span>
                  )}
                </div>
              </div>
              {depositPercent > 0 && depositPercent < 100 && (
                <p className="text-[11px] text-muted-foreground text-right">
                  La factura se cobra en 2 cuotas: reserva {fmt(depositAmount)} + balance {fmt(total - depositAmount)}.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Notes + Footer */}
      <div className="bg-card rounded-xl border border-border p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Notas para el cliente
          </label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={initial?.notes ?? ""}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
            placeholder="Ej. Gracias por confiar en nosotros. Los pagos pueden realizarse vía transferencia..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Pie de factura
          </label>
          <textarea
            name="footer"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
            placeholder="Términos y condiciones, información bancaria, etc."
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2.5 bg-brand text-brand-foreground text-sm font-medium rounded-lg hover:bg-brand/90 transition-colors disabled:opacity-50"
        >
          {isEdit
            ? isPending
              ? "Guardando..."
              : "Guardar cambios"
            : isPending
              ? "Creando..."
              : "Crear factura"}
        </button>
        <a
          href={isEdit && invoiceId ? `/invoices/${invoiceId}` : "/invoices"}
          className="px-5 py-2.5 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted transition-colors"
        >
          Cancelar
        </a>
        {isEdit && invoiceNumber && (
          <span className="text-xs text-muted-foreground ml-auto">
            Editando factura {invoiceNumber}
          </span>
        )}
      </div>
    </form>
  )
}
