"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Phone,
  Mail,
  Search,
  UserCog,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils/cn"
import { formatCurrency } from "@/lib/utils/currency"
import {
  COLLABORATOR_TYPES,
  collaboratorTypeLabel,
} from "@/lib/constants/collaborators"
import {
  createCollaboratorAction,
  updateCollaboratorAction,
  deleteCollaboratorAction,
} from "@/server/actions/collaborator.actions"

export type CollaboratorUI = {
  id: string
  name: string
  type: string
  phone: string | null
  whatsapp: string | null
  email: string | null
  serviceOffered: string | null
  baseRate: number | null
  notes: string | null
  status: "active" | "inactive"
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
const labelCls = "mb-1 block text-xs font-medium text-foreground"

export function CollaboratorManager({
  collaborators: initial,
}: {
  collaborators: CollaboratorUI[]
}) {
  const router = useRouter()
  const [collaborators, setCollaborators] = React.useState(initial)
  const [query, setQuery] = React.useState("")
  const [showInactive, setShowInactive] = React.useState(false)
  const [editing, setEditing] = React.useState<CollaboratorUI | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => setCollaborators(initial), [initial])

  const filtered = collaborators.filter((c) => {
    if (!showInactive && c.status === "inactive") return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      collaboratorTypeLabel(c.type).toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.serviceOffered ?? "").toLowerCase().includes(q)
    )
  })

  const handleDelete = (c: CollaboratorUI) => {
    if (!confirm(`¿Eliminar a ${c.name}? No se borra de proyectos pasados.`)) return
    startTransition(async () => {
      try {
        await deleteCollaboratorAction(c.id)
        toast.success("Colaborador eliminado")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar colaborador…"
            className={cn(inputCls, "pl-8")}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border"
            />
            Ver inactivos
          </label>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" /> Nuevo colaborador
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="sf-card flex flex-col items-center justify-center px-6 py-16 text-center">
          <UserCog className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {collaborators.length === 0
              ? "Aún no registras colaboradores. Crea el primero (maquillista, asistente, 2º fotógrafo…)."
              : "Ningún colaborador coincide con la búsqueda."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={cn(
                "sf-card flex flex-col gap-2 p-4",
                c.status === "inactive" && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {c.name}
                  </p>
                  <span className="mt-0.5 inline-flex rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold text-brand">
                    {collaboratorTypeLabel(c.type)}
                  </span>
                </div>
                <div className="flex flex-shrink-0 gap-1">
                  <button
                    onClick={() => setEditing(c)}
                    title="Editar"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={pending}
                    title="Eliminar"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {c.serviceOffered && (
                <p className="truncate text-xs text-muted-foreground">
                  {c.serviceOffered}
                </p>
              )}
              <div className="mt-auto space-y-1 text-xs text-muted-foreground">
                {(c.phone || c.whatsapp) && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3" /> {c.phone ?? c.whatsapp}
                  </p>
                )}
                {c.email && (
                  <p className="flex items-center gap-1.5 truncate">
                    <Mail className="h-3 w-3" /> {c.email}
                  </p>
                )}
                {c.baseRate != null && c.baseRate > 0 && (
                  <p className="font-medium text-foreground">
                    Tarifa base: {formatCurrency(c.baseRate, "DOP")}
                  </p>
                )}
                {c.status === "inactive" && (
                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Inactivo
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <CollaboratorFormModal
          collaborator={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function CollaboratorFormModal({
  collaborator,
  onClose,
  onSaved,
}: {
  collaborator: CollaboratorUI | null
  onClose: () => void
  onSaved: () => void
}) {
  const [pending, startTransition] = React.useTransition()
  const isEdit = !!collaborator

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        if (isEdit) await updateCollaboratorAction(collaborator!.id, fd)
        else await createCollaboratorAction(fd)
        toast.success(isEdit ? "Colaborador actualizado" : "Colaborador creado")
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            {isEdit ? "Editar colaborador" : "Nuevo colaborador"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Nombre *</label>
            <input
              name="name"
              required
              defaultValue={collaborator?.name ?? ""}
              className={inputCls}
              autoFocus
            />
          </div>
          <div>
            <label className={labelCls}>Tipo de colaborador</label>
            <select
              name="type"
              defaultValue={collaborator?.type ?? "otro"}
              className={inputCls}
            >
              {COLLABORATOR_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Estado</label>
            <select
              name="status"
              defaultValue={collaborator?.status ?? "active"}
              className={inputCls}
            >
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Teléfono</label>
            <input
              name="phone"
              defaultValue={collaborator?.phone ?? ""}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>WhatsApp</label>
            <input
              name="whatsapp"
              defaultValue={collaborator?.whatsapp ?? ""}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Correo electrónico</label>
            <input
              name="email"
              type="email"
              defaultValue={collaborator?.email ?? ""}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Servicio que ofrece</label>
            <input
              name="serviceOffered"
              placeholder="Ej: Maquillaje y peinado de novia"
              defaultValue={collaborator?.serviceOffered ?? ""}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Tarifa base (DOP)</label>
            <input
              name="baseRate"
              type="number"
              min="0"
              step="0.01"
              defaultValue={collaborator?.baseRate ?? ""}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Notas internas</label>
            <textarea
              name="notes"
              rows={3}
              defaultValue={collaborator?.notes ?? ""}
              className={cn(inputCls, "resize-y")}
            />
          </div>

          <div className="mt-1 flex justify-end gap-2 sm:col-span-2">
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
              {pending ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
