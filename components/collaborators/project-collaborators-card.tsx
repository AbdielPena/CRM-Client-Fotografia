"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  BadgeCheck,
  AlertTriangle,
  CheckCircle2,
  Mail,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils/cn"
import { formatCurrency } from "@/lib/utils/currency"
import type { RequirementStatus } from "@/lib/collaborators/requirements"
import {
  COLLABORATOR_TYPES,
  collaboratorTypeLabel,
  CONFIRM_STATUS_LABELS,
  PAY_STATUS_LABELS,
} from "@/lib/constants/collaborators"
import {
  assignCollaboratorAction,
  updateAssignmentAction,
  removeAssignmentAction,
  createCollaboratorAction,
  resendCollaboratorInviteAction,
  registerAssignmentPaymentAction,
} from "@/server/actions/collaborator.actions"

export type ProjectCollaboratorUI = {
  id: string
  role: string | null
  agreedPay: number
  /** Suma de los abonos ya registrados. */
  paidAmount: number
  /** true = la sesión ya pasó y la deuda está activa en Finanzas. */
  debtRegistered: boolean
  payStatus: "pending" | "partial" | "paid" | "cancelled"
  confirmStatus: "pending" | "invited" | "confirmed" | "rejected" | "completed"
  serviceDate: string | null
  paymentMethod: string | null
  notes: string | null
  collaborator: { id: string; name: string; type: string } | null
}

export type RosterOption = { id: string; name: string; type: string }

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
const labelCls = "mb-1 block text-xs font-medium text-foreground"

const payBadge = (s: string) =>
  s === "paid"
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
    : s === "cancelled"
      ? "bg-muted text-muted-foreground line-through"
      : s === "partial"
        ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
        : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"

const confirmBadge = (s: string) =>
  s === "confirmed" || s === "completed"
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
    : s === "invited"
      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
      : s === "rejected"
        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
        : "bg-muted text-muted-foreground"

export function ProjectCollaboratorsCard({
  projectId,
  assignments,
  roster,
  currency = "DOP",
  requirements = [],
  eventDate = null,
}: {
  projectId: string
  assignments: ProjectCollaboratorUI[]
  roster: RosterOption[]
  currency?: string
  requirements?: RequirementStatus[]
  eventDate?: string | null
}) {
  const router = useRouter()
  const [modal, setModal] = React.useState<
    null | { mode: "create" } | { mode: "edit"; row: ProjectCollaboratorUI }
  >(null)
  const [payModal, setPayModal] = React.useState<ProjectCollaboratorUI | null>(
    null,
  )
  const [pending, startTransition] = React.useTransition()

  const handleRemove = (row: ProjectCollaboratorUI) => {
    if (!confirm(`¿Quitar a ${row.collaborator?.name ?? "este colaborador"} del proyecto?`))
      return
    startTransition(async () => {
      try {
        await removeAssignmentAction(row.id, projectId)
        toast.success("Colaborador quitado")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  const resendInvite = (row: ProjectCollaboratorUI) => {
    startTransition(async () => {
      try {
        await resendCollaboratorInviteAction(row.id, projectId)
        toast.success("Invitación enviada")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  // Reabrir un pago ya saldado (vuelve a pendiente). El registro de pagos vive
  // en el modal `PaymentModal`: total, parcial o manual.
  const reopenPayment = (row: ProjectCollaboratorUI) => {
    const fd = new FormData()
    fd.set("payStatus", "pending")
    startTransition(async () => {
      try {
        await updateAssignmentAction(row.id, projectId, fd)
        toast.success("Marcado como pendiente")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  return (
    <div className="sf-card">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            Colaboradores ({assignments.length})
          </h2>
        </div>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="text-xs font-medium text-primary hover:text-primary/80"
        >
          + Asignar
        </button>
      </div>

      {/* Validación de requisitos del plan */}
      {requirements.length > 0 && (
        <div className="space-y-2 border-b border-border/60 px-5 py-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {requirements.map((r) => (
              <span key={r.type} className="flex items-center gap-1.5 text-xs">
                {r.satisfied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                )}
                <span className="text-foreground">{r.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {r.assigned}/{r.required}
                </span>
                <span
                  className={cn(
                    "font-semibold",
                    r.satisfied ? "text-emerald-600" : "text-amber-600",
                  )}
                >
                  {r.satisfied ? "Validado" : "Falta"}
                </span>
              </span>
            ))}
          </div>
          {requirements.some((r) => !r.satisfied) && (
            <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {requirements
                .filter((r) => !r.satisfied)
                .map(
                  (r) =>
                    `Este proyecto requiere ${r.label.toLowerCase()}${r.required > 1 ? ` (${r.required})` : ""} y aún falta asignar.`,
                )
                .join(" ")}
            </p>
          )}
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="py-8 text-center">
          <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Sin colaboradores asignados todavía
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground">
                    {a.collaborator?.name ?? "—"}
                  </p>
                  <span className="inline-flex rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                    {a.role || collaboratorTypeLabel(a.collaborator?.type)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      confirmBadge(a.confirmStatus),
                    )}
                  >
                    {CONFIRM_STATUS_LABELS[a.confirmStatus] ?? a.confirmStatus}
                  </span>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      payBadge(a.payStatus),
                    )}
                  >
                    {PAY_STATUS_LABELS[a.payStatus] ?? a.payStatus}
                    {a.agreedPay > 0 && ` · ${formatCurrency(a.agreedPay, currency)}`}
                  </span>
                  {/* La deuda solo cuenta cuando la sesión ya pasó. */}
                  {a.agreedPay > 0 &&
                    a.payStatus !== "cancelled" &&
                    !a.debtRegistered && (
                      <span className="inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Aún no se debe (sesión pendiente)
                      </span>
                    )}
                </div>
                {a.paidAmount > 0 && a.payStatus !== "cancelled" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Abonado {formatCurrency(a.paidAmount, currency)}
                    {a.agreedPay - a.paidAmount > 0 && (
                      <>
                        {" · "}
                        <span className="font-semibold text-amber-600">
                          Resta {formatCurrency(a.agreedPay - a.paidAmount, currency)}
                        </span>
                      </>
                    )}
                  </p>
                )}
                {a.notes && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {a.notes}
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  onClick={() => resendInvite(a)}
                  disabled={pending}
                  title="Enviar / reenviar invitación por correo"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Mail className="h-3.5 w-3.5" />
                </button>
                {a.payStatus !== "cancelled" && a.agreedPay > 0 && (
                  <button
                    onClick={() =>
                      a.payStatus === "paid" ? reopenPayment(a) : setPayModal(a)
                    }
                    disabled={pending}
                    title={
                      a.payStatus === "paid"
                        ? "Reabrir (marcar pendiente)"
                        : "Registrar pago (completo o parcial)"
                    }
                    className={cn(
                      "rounded-md p-1.5",
                      a.payStatus === "paid"
                        ? "text-emerald-600"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <BadgeCheck className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setModal({ mode: "edit", row: a })}
                  title="Editar"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleRemove(a)}
                  disabled={pending}
                  title="Quitar"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <AssignModal
          projectId={projectId}
          roster={roster}
          editing={modal.mode === "edit" ? modal.row : null}
          eventDate={eventDate}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}

      {payModal && (
        <PaymentModal
          projectId={projectId}
          row={payModal}
          currency={currency}
          onClose={() => setPayModal(null)}
          onSaved={() => {
            setPayModal(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

/**
 * Registro de pago al colaborador: COMPLETO (el saldo entero), PARCIAL (un
 * abono) o MANUAL (cualquier monto). Cada pago genera su recibo por correo y
 * se espeja como gasto en FinanzApp.
 */
function PaymentModal({
  projectId,
  row,
  currency,
  onClose,
  onSaved,
}: {
  projectId: string
  row: ProjectCollaboratorUI
  currency: string
  onClose: () => void
  onSaved: () => void
}) {
  const saldo = Math.max(0, row.agreedPay - row.paidAmount)
  const [amount, setAmount] = React.useState<string>(String(saldo))
  const [method, setMethod] = React.useState("Transferencia")
  const [paidOn, setPaidOn] = React.useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santo_Domingo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  )
  const [note, setNote] = React.useState("")
  const [sendReceipt, setSendReceipt] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const monto = Number(amount) || 0
  const esParcial = monto > 0 && monto < saldo
  const restante = Math.max(0, saldo - monto)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (monto <= 0) {
      toast.error("Indica un monto mayor que cero")
      return
    }
    setSaving(true)
    const fd = new FormData()
    fd.set("amount", String(monto))
    fd.set("method", method)
    fd.set("paidOn", paidOn)
    fd.set("note", note)
    fd.set("projectId", projectId)
    fd.set("sendReceipt", sendReceipt ? "1" : "0")
    try {
      const r = await registerAssignmentPaymentAction(row.id, fd)
      if (!r.ok) {
        toast.error(r.error)
        setSaving(false)
        return
      }
      toast.success(
        r.payStatus === "paid"
          ? `Pago completo registrado · recibo ${r.receiptNumber}`
          : `Abono registrado · resta ${formatCurrency(r.pending, currency)}`,
        {
          description: [
            r.finanzapp ? "Registrado en Finanzas" : "Pendiente de espejar en Finanzas",
            r.emailed ? "Recibo enviado por correo" : null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      )
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Registrar pago
            </h3>
            <p className="text-xs text-muted-foreground">
              {row.collaborator?.name ?? "Colaborador"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Acordado</span>
            <span className="font-medium text-foreground">
              {formatCurrency(row.agreedPay, currency)}
            </span>
          </div>
          {row.paidAmount > 0 && (
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Ya abonado</span>
              <span className="font-medium text-emerald-600">
                {formatCurrency(row.paidAmount, currency)}
              </span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border/60 pt-1">
            <span className="text-muted-foreground">Saldo</span>
            <span className="font-semibold text-amber-600">
              {formatCurrency(saldo, currency)}
            </span>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className={labelCls}>Monto a pagar</label>
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => setAmount(String(saldo))}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
              >
                Pago completo
              </button>
              <button
                type="button"
                onClick={() => setAmount(String(Math.round(saldo / 2)))}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
              >
                Mitad
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={saldo}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputCls}
              required
            />
            {esParcial && (
              <p className="mt-1 text-[11px] text-sky-600">
                Abono parcial · quedará un saldo de{" "}
                {formatCurrency(restante, currency)}
              </p>
            )}
            {monto > saldo && (
              <p className="mt-1 text-[11px] text-amber-600">
                Se registrará solo el saldo ({formatCurrency(saldo, currency)}).
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Método</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={inputCls}
              >
                <option>Transferencia</option>
                <option>Efectivo</option>
                <option>Tarjeta</option>
                <option>Cheque</option>
                <option>Otro</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Fecha del pago</label>
              <input
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Nota (opcional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: adelanto acordado por WhatsApp"
              className={inputCls}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={sendReceipt}
              onChange={(e) => setSendReceipt(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Enviar recibo por correo al colaborador
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "Registrando…" : "Registrar pago"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AssignModal({
  projectId,
  roster,
  editing,
  eventDate,
  onClose,
  onSaved,
}: {
  projectId: string
  roster: RosterOption[]
  editing: ProjectCollaboratorUI | null
  eventDate?: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [pending, startTransition] = React.useTransition()
  // En modo asignar: elegir existente o crear nuevo.
  const [newMode, setNewMode] = React.useState(roster.length === 0)
  const [sendInvite, setSendInvite] = React.useState(true)
  const isEdit = !!editing

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    if (!isEdit) fd.set("sendInvite", sendInvite ? "true" : "false")
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateAssignmentAction(editing!.id, projectId, fd)
        } else if (newMode) {
          // Crear colaborador nuevo y luego asignarlo.
          const cf = new FormData()
          cf.set("name", String(fd.get("newName") ?? ""))
          cf.set("type", String(fd.get("newType") ?? "otro"))
          cf.set("email", String(fd.get("newEmail") ?? ""))
          const res = await createCollaboratorAction(cf)
          fd.set("collaboratorId", res.id)
          await assignCollaboratorAction(projectId, fd)
        } else {
          await assignCollaboratorAction(projectId, fd)
        }
        toast.success(isEdit ? "Asignación actualizada" : "Colaborador asignado")
        onSaved()
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            {isEdit ? "Editar asignación" : "Asignar colaborador"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isEdit ? (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
              {editing!.collaborator?.name ?? "Colaborador"}
            </div>
          ) : newMode ? (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nombre del nuevo colaborador *</label>
                <input name="newName" required className={inputCls} autoFocus />
              </div>
              <div>
                <label className={labelCls}>Tipo</label>
                <select name="newType" defaultValue="otro" className={inputCls}>
                  {COLLABORATOR_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>
                  Correo electrónico{" "}
                  <span className="font-normal text-muted-foreground">
                    (para enviarle la invitación)
                  </span>
                </label>
                <input
                  name="newEmail"
                  type="email"
                  placeholder="colaborador@correo.com"
                  className={inputCls}
                />
              </div>
              {roster.length > 0 && (
                <button
                  type="button"
                  onClick={() => setNewMode(false)}
                  className="text-xs font-medium text-primary hover:text-primary/80"
                >
                  ← Elegir uno existente
                </button>
              )}
            </div>
          ) : (
            <div>
              <label className={labelCls}>Colaborador *</label>
              <select name="collaboratorId" required className={inputCls} defaultValue="">
                <option value="" disabled>
                  Elegir colaborador…
                </option>
                {roster.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {collaboratorTypeLabel(r.type)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setNewMode(true)}
                className="mt-1.5 text-xs font-medium text-primary hover:text-primary/80"
              >
                + Crear uno nuevo
              </button>
            </div>
          )}

          <div>
            <label className={labelCls}>Rol en el proyecto</label>
            <input
              name="role"
              placeholder="Ej: Maquillaje de la quinceañera"
              defaultValue={editing?.role ?? ""}
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Pago acordado (DOP)</label>
              <input
                name="agreedPay"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editing?.agreedPay ?? ""}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Estado del pago</label>
              <select
                name="payStatus"
                defaultValue={editing?.payStatus ?? "pending"}
                className={inputCls}
              >
                <option value="pending">Pendiente</option>
                <option value="paid">Pagado</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Método de pago</label>
              <select
                name="paymentMethod"
                defaultValue={editing?.paymentMethod ?? ""}
                className={inputCls}
              >
                <option value="">—</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="cheque">Cheque</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Fecha del servicio</label>
              <input
                name="serviceDate"
                type="date"
                defaultValue={(editing?.serviceDate ?? eventDate ?? "").slice(0, 10)}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Notas internas</label>
            <textarea
              name="notes"
              rows={2}
              defaultValue={editing?.notes ?? ""}
              className={cn(inputCls, "resize-y")}
            />
          </div>

          {!isEdit && (
            <label className="flex items-center gap-2 pt-1 text-xs text-foreground">
              <input
                type="checkbox"
                checked={sendInvite}
                onChange={(e) => setSendInvite(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border"
              />
              Enviar invitación por correo (si tiene email)
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-9 rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {pending ? "Guardando…" : isEdit ? "Guardar" : "Asignar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
