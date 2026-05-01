"use client"

import { useState, useTransition } from "react"
import { GripVertical, Pencil, Trash2, Plus, X, Check } from "lucide-react"
import {
  createProjectStatusAction,
  updateProjectStatusAction,
  deleteProjectStatusAction,
  reorderProjectStatusesAction,
} from "@/server/actions/project-status.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { toast } from "sonner"

type Status = {
  id: string
  label: string
  color: string
  position: number
  is_default: boolean
}

const PRESET_COLORS = [
  "#94a3b8", "#3b82f6", "#8b5cf6", "#6366f1",
  "#f59e0b", "#ec4899", "#14b8a6", "#10b981",
  "#ef4444", "#f97316", "#84cc16", "#06b6d4",
]

export function ProjectStatusManager({ initialStatuses }: { initialStatuses: Status[] }) {
  const [statuses, setStatuses] = useState(initialStatuses)
  const [editing, setEditing] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [editColor, setEditColor] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [newColor, setNewColor] = useState("#6366f1")
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Create ──────────────────────────────────────────────────────
  const handleCreate = () => {
    if (!newLabel.trim()) return
    const fd = new FormData()
    fd.append("label", newLabel.trim())
    fd.append("color", newColor)
    startTransition(async () => {
      const res = await createProjectStatusAction(fd)
      if (res.error) { toast.error(res.error); return }
      toast.success("Estado creado")
      setStatuses((prev) => [
        ...prev,
        { ...res.status!, position: prev.length, is_default: false },
      ])
      setNewLabel("")
      setNewColor("#6366f1")
      setShowCreate(false)
    })
  }

  // ── Edit ────────────────────────────────────────────────────────
  const startEdit = (s: Status) => {
    setEditing(s.id)
    setEditLabel(s.label)
    setEditColor(s.color)
  }

  const saveEdit = (id: string) => {
    const fd = new FormData()
    fd.append("label", editLabel)
    fd.append("color", editColor)
    startTransition(async () => {
      const res = await updateProjectStatusAction(id, fd)
      if (res.error) { toast.error(res.error); return }
      toast.success("Estado actualizado")
      setStatuses((prev) =>
        prev.map((s) => s.id === id ? { ...s, label: editLabel, color: editColor } : s),
      )
      setEditing(null)
    })
  }

  // ── Delete ──────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    const res = await deleteProjectStatusAction(id)
    if (res.error) { toast.error(res.error); return }
    toast.success("Estado eliminado")
    setStatuses((prev) => prev.filter((s) => s.id !== id))
  }

  // ── Drag & drop reorder ─────────────────────────────────────────
  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return
    const reordered = [...statuses]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setStatuses(reordered)
    setDragIdx(null)
    setOverIdx(null)
    const ids = reordered.map((s) => s.id)
    startTransition(async () => {
      await reorderProjectStatusesAction(ids)
    })
  }

  return (
    <div className="max-w-lg space-y-3">
      {/* List */}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {statuses.map((s, idx) => (
          <div
            key={s.id}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => { e.preventDefault(); setOverIdx(idx) }}
            onDrop={() => handleDrop(idx)}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
            className={`flex items-center gap-3 px-4 py-3 transition-colors ${
              overIdx === idx ? "bg-brand/5" : "hover:bg-muted/40"
            } ${dragIdx === idx ? "opacity-40" : ""}`}
          >
            {/* Drag handle */}
            <GripVertical className="h-4 w-4 flex-shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />

            {/* Color dot */}
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />

            {/* Label o form de edición */}
            {editing === s.id ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  autoFocus
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(s.id)
                    if (e.key === "Escape") setEditing(null)
                  }}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                {/* Color picker */}
                <div className="flex flex-wrap gap-1">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`h-4 w-4 rounded-full transition-transform hover:scale-110 ${
                        editColor === c ? "ring-2 ring-offset-1 ring-foreground" : ""
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => saveEdit(s.id)}
                  className="text-brand hover:text-brand/80"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-foreground">{s.label}</span>
                {s.is_default && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Default
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {!s.is_default && (
                    <ConfirmDialog
                      title="Eliminar estado"
                      description={`¿Eliminar "${s.label}"? Solo funciona si no hay proyectos activos con este estado.`}
                      confirmLabel="Eliminar"
                      danger
                      onConfirm={() => handleDelete(s.id)}
                    >
                      <button
                        type="button"
                        className="rounded-md p-1 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </ConfirmDialog>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Create form */}
      {showCreate ? (
        <div className="rounded-xl border border-brand/30 bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Nuevo estado</p>
          <input
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
            placeholder="Nombre del estado, ej. Esperando aprobación"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Color</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                    newColor === c ? "ring-2 ring-offset-2 ring-foreground" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {/* Preview */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Vista previa:</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: newColor + "22", color: newColor }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: newColor }} />
              {newLabel || "Mi estado"}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newLabel.trim() || isPending}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
            >
              Crear estado
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
        >
          <Plus className="h-4 w-4" />
          Nuevo estado
        </button>
      )}

      <p className="text-xs text-muted-foreground">
        Arrastra los estados para cambiar el orden. El color aparece en las tarjetas de proyectos.
      </p>
    </div>
  )
}
