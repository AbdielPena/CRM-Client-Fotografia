"use client"

import * as React from "react"
import { toast } from "sonner"
import { X, Loader2, Check, Trash2, Plus, Wallet } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { formatCurrency } from "@/lib/utils/currency"
import {
  loadCollaboratorPaymentsAction,
  loadCollaboratorJobsAction,
  createCollaboratorPaymentAction,
  markCollaboratorPaymentPaidAction,
  cancelCollaboratorPaymentAction,
} from "@/server/actions/collaborator.actions"
import { AssignmentPaymentModal } from "./assignment-payment-modal"

type Job = {
  id: string
  sessionName: string
  serviceDate: string | null
  agreedPay: number
  paidAmount: number
  pending: number
  payStatus: string
  debtRegistered: boolean
  debtState: "owed" | "future" | "before_cutoff" | "settled"
  cutoffDate: string | null
  projectId: string
}

type Payment = {
  id: string
  concept: string
  description: string | null
  amount: number
  status: string
  paymentMethod: string | null
  paymentDate: string | null
  paidAt: string | null
}

const CONCEPTS = [
  { value: "bono", label: "Bono" },
  { value: "ajuste", label: "Ajuste" },
  { value: "reembolso", label: "Reembolso" },
  { value: "extraordinario", label: "Pago extraordinario" },
  { value: "otro", label: "Otro" },
]
const CONCEPT_LABEL: Record<string, string> = Object.fromEntries(
  CONCEPTS.map((c) => [c.value, c.label]),
)

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
const labelCls = "mb-1 block text-xs font-medium text-foreground"

function statusBadge(status: string) {
  if (status === "paid")
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        Pagado
      </span>
    )
  if (status === "cancelled")
    return (
      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
        Cancelado
      </span>
    )
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
      Pendiente
    </span>
  )
}

export function CollaboratorPaymentsModal({
  collaboratorId,
  collaboratorName,
  financeAccounts,
  onClose,
  onChanged,
}: {
  collaboratorId: string
  collaboratorName: string
  financeAccounts: { id: string; name: string }[]
  onClose: () => void
  onChanged: () => void
}) {
  const [payments, setPayments] = React.useState<Payment[] | null>(null)
  const [jobs, setJobs] = React.useState<Job[] | null>(null)
  const [payJob, setPayJob] = React.useState<Job | null>(null)
  const [status, setStatus] = React.useState<"pending" | "paid">("pending")
  const [pending, startTransition] = React.useTransition()

  const reload = React.useCallback(() => {
    loadCollaboratorPaymentsAction(collaboratorId)
      .then((r) => setPayments(r.payments))
      .catch(() => setPayments([]))
    // Trabajos (sesiones) con su saldo: es lo que Abdiel viene a pagar aquí.
    loadCollaboratorJobsAction(collaboratorId)
      .then((r) => setJobs(r.jobs))
      .catch(() => setJobs([]))
  }, [collaboratorId])

  React.useEffect(() => {
    reload()
  }, [reload])

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    startTransition(async () => {
      try {
        await createCollaboratorPaymentAction(collaboratorId, fd)
        toast.success("Pago registrado")
        form.reset()
        setStatus("pending")
        reload()
        onChanged()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  const handleMarkPaid = (id: string) => {
    startTransition(async () => {
      try {
        await markCollaboratorPaymentPaidAction(id)
        toast.success("Marcado como pagado")
        reload()
        onChanged()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  const handleCancel = (id: string) => {
    if (!confirm("¿Cancelar este pago? También se anula en Finanzas.")) return
    startTransition(async () => {
      try {
        await cancelCollaboratorPaymentAction(id)
        toast.success("Pago cancelado")
        reload()
        onChanged()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Wallet className="h-4 w-4 text-brand" /> Pagos de {collaboratorName}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Trabajos por sesión: lo que se le debe y el registro del pago ── */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              Trabajos (sesiones)
            </h4>
            {jobs && jobs.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Por pagar:{" "}
                <strong className="text-amber-600">
                  {formatCurrency(
                    jobs
                      .filter((j) => j.debtState === "owed")
                      .reduce((s, j) => s + j.pending, 0),
                    "DOP",
                  )}
                </strong>
              </span>
            )}
          </div>

          {jobs === null ? (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando trabajos…
            </div>
          ) : jobs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Sin trabajos con pago acordado.
            </p>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => {
                const saldado = j.debtState === "settled"
                const seDebe = j.debtState === "owed"
                // Solo lo que se debe HOY va en naranja; lo demás en gris para
                // que no parezca deuda (el total de arriba tampoco lo suma).
                const nota =
                  j.debtState === "future"
                    ? "Aún no se debe — la sesión no ha pasado"
                    : j.debtState === "before_cutoff"
                      ? `No cuenta como deuda — la sesión es anterior al inicio del control${
                          j.cutoffDate ? ` (${j.cutoffDate})` : ""
                        }`
                      : null
                return (
                  <div
                    key={j.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">
                        {j.sessionName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {j.serviceDate ?? "sin fecha"} ·{" "}
                        {formatCurrency(j.agreedPay, "DOP")}
                        {j.paidAmount > 0 && (
                          <> · abonado {formatCurrency(j.paidAmount, "DOP")}</>
                        )}
                      </p>
                      {nota && (
                        <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                          {nota}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {saldado ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          Pagado
                        </span>
                      ) : (
                        <>
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              seDebe ? "text-amber-600" : "text-muted-foreground",
                            )}
                          >
                            {formatCurrency(j.pending, "DOP")}
                          </span>
                          <button
                            onClick={() => setPayJob(j)}
                            title={
                              seDebe
                                ? "Registrar pago"
                                : "Pagar de todos modos (no está en el pendiente)"
                            }
                            className={cn(
                              "rounded-md px-2.5 py-1 text-[11px] font-semibold",
                              seDebe
                                ? "bg-primary text-primary-foreground hover:opacity-90"
                                : "border border-border text-foreground hover:bg-muted",
                            )}
                          >
                            Pagar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="mb-2 border-t border-border/60 pt-4">
          <h4 className="text-sm font-semibold text-foreground">Pagos adicionales</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bonos, ajustes o reembolsos que no van ligados a una sesión.
          </p>
        </div>

        {/* Alta */}
        <form
          onSubmit={handleAdd}
          className="mb-5 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3"
        >
          <div>
            <label className={labelCls}>Concepto</label>
            <select name="concept" defaultValue="bono" className={inputCls}>
              {CONCEPTS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Monto (DOP) *</label>
            <input
              name="amount"
              type="number"
              min="1"
              step="0.01"
              required
              className={inputCls}
              placeholder="0.00"
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Descripción</label>
            <input
              name="description"
              className={inputCls}
              placeholder="Ej: Bono por trabajo extra en la boda"
            />
          </div>
          <div>
            <label className={labelCls}>Estado</label>
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "pending" | "paid")}
              className={inputCls}
            >
              <option value="pending">Pendiente (por pagar)</option>
              <option value="paid">Ya pagado</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Fecha</label>
            <input name="paymentDate" type="date" className={inputCls} />
          </div>
          {status === "paid" && (
            <>
              <div>
                <label className={labelCls}>Método</label>
                <input
                  name="paymentMethod"
                  className={inputCls}
                  placeholder="Efectivo, transferencia…"
                />
              </div>
              {financeAccounts.length > 0 && (
                <div>
                  <label className={labelCls}>Cuenta (Finanzas)</label>
                  <select name="accountId" defaultValue="" className={inputCls}>
                    <option value="">Automática</option>
                    {financeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          <div className="col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Registrar pago
            </button>
          </div>
        </form>

        {/* Lista */}
        <div className="space-y-2">
          {payments === null ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aún no hay pagos adicionales registrados.
            </p>
          ) : (
            payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {CONCEPT_LABEL[p.concept] ?? "Pago"}
                    </span>
                    {statusBadge(p.status)}
                  </div>
                  {p.description && (
                    <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                  )}
                  {(p.paymentDate || p.paymentMethod) && (
                    <p className="text-[11px] text-muted-foreground">
                      {[p.paymentDate, p.paymentMethod].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {formatCurrency(p.amount, "DOP")}
                  </span>
                  {p.status === "pending" && (
                    <button
                      onClick={() => handleMarkPaid(p.id)}
                      disabled={pending}
                      title="Marcar pagado"
                      className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  {p.status !== "cancelled" && (
                    <button
                      onClick={() => handleCancel(p.id)}
                      disabled={pending}
                      title="Cancelar"
                      className={cn(
                        "rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40",
                      )}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {payJob && (
        <AssignmentPaymentModal
          row={{
            id: payJob.id,
            agreedPay: payJob.agreedPay,
            paidAmount: payJob.paidAmount,
            collaboratorName,
            sessionName: payJob.sessionName,
            serviceDate: payJob.serviceDate,
          }}
          projectId={payJob.projectId}
          financeAccounts={financeAccounts}
          onClose={() => setPayJob(null)}
          onSaved={() => {
            setPayJob(null)
            reload()
            onChanged()
          }}
        />
      )}
    </div>
  )
}
