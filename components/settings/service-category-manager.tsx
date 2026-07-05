"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2, X, Link2, Copy, Check, Package } from "lucide-react"
import { toast } from "sonner"

import {
  createServiceCategoryAction,
  updateServiceCategoryAction,
  deleteServiceCategoryAction,
} from "@/server/actions/service-category.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { IconSelector, CategoryIcon } from "@/components/shared/icon-selector"

export interface ServiceCategoryView {
  id: string
  name: string
  slug: string | null
  color: string
  icon: string
  description: string | null
  isActive: boolean
  sortOrder: number
  packageCount: number
  thankyouMessage: string | null
  dressIncludedAmount: number | null
}

type FormMode = "create" | "edit" | null

export function ServiceCategoryManager({ categories }: { categories: ServiceCategoryView[] }) {
  const router = useRouter()
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [editing, setEditing] = useState<ServiceCategoryView | null>(null)
  const [pending, start] = useTransition()
  const [origin, setOrigin] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const copyLink = async (cat: ServiceCategoryView) => {
    const url = `${origin}/booking/${cat.slug}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Fallback para WebView/contextos sin clipboard API
      const ta = document.createElement("textarea")
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand("copy")
      } catch {
        /* noop */
      }
      document.body.removeChild(ta)
    }
    setCopiedId(cat.id)
    toast.success("Link copiado")
    setTimeout(() => setCopiedId((c) => (c === cat.id ? null : c)), 1800)
  }

  const onCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const r = await createServiceCategoryAction(fd)
      if (r?.success) {
        toast.success("Categoría creada")
        setFormMode(null)
        router.refresh()
      } else {
        toast.error(r?.error ?? "Error")
      }
    })
  }

  const onUpdate = (id: string, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const r = await updateServiceCategoryAction(id, fd)
      if (r?.success) {
        toast.success("Categoría actualizada")
        setFormMode(null)
        setEditing(null)
        router.refresh()
      } else {
        toast.error(r?.error ?? "Error")
      }
    })
  }

  const onDelete = async (id: string) => {
    const r = await deleteServiceCategoryAction(id)
    if (r?.success) {
      toast.success("Categoría eliminada")
      router.refresh()
    } else {
      toast.error(r?.error ?? "Error")
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <div
            key={c.id}
            className={`rounded-xl border bg-card p-4 ${c.isActive ? "border-border" : "border-border/60 opacity-60"}`}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: c.color }}
              >
                <CategoryIcon name={c.icon} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                {!c.isActive ? (
                  <span className="text-[11px] text-muted-foreground">Inactiva</span>
                ) : c.description ? (
                  <p className="truncate text-[11px] text-muted-foreground">{c.description}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(c)
                  setFormMode("edit")
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
              <ConfirmDialog
                title="Eliminar categoría"
                description={`¿Eliminar la categoría "${c.name}"?`}
                confirmLabel="Eliminar"
                danger
                onConfirm={() => onDelete(c.id)}
              >
                <button className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </ConfirmDialog>
            </div>

            {/* Planes + link público de la categoría */}
            <div className="mt-3 border-t border-border/60 pt-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                {c.packageCount} {c.packageCount === 1 ? "plan activo" : "planes activos"}
              </div>
              {c.slug && (
                <div className="mt-2 flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-[11px] text-foreground/80">
                    /booking/{c.slug}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyLink(c)}
                    disabled={!c.isActive}
                    title={
                      c.isActive
                        ? "Copiar link público"
                        : "Categoría inactiva: el link no está disponible"
                    }
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {copiedId === c.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              )}
              {!c.isActive && (
                <p className="mt-1.5 text-[10.5px] text-amber-600">
                  Inactiva — el link público no está disponible.
                </p>
              )}
            </div>
          </div>
        ))}

        {formMode !== "create" && (
          <button
            type="button"
            onClick={() => setFormMode("create")}
            className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/50 p-4 transition-colors hover:border-border-strong hover:bg-muted"
          >
            <Plus className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">Nueva categoría</p>
          </button>
        )}
      </div>

      {formMode === "create" && (
        <CategoryForm onSubmit={onCreate} onCancel={() => setFormMode(null)} pending={pending} title="Nueva categoría" />
      )}
      {formMode === "edit" && editing && (
        <CategoryForm
          onSubmit={(e) => onUpdate(editing.id, e)}
          onCancel={() => {
            setFormMode(null)
            setEditing(null)
          }}
          pending={pending}
          title={`Editando: ${editing.name}`}
          defaults={editing}
        />
      )}
    </div>
  )
}

function CategoryForm({
  onSubmit,
  onCancel,
  pending,
  title,
  defaults,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  pending: boolean
  title: string
  defaults?: ServiceCategoryView
}) {
  const [active, setActive] = useState(defaults ? defaults.isActive : true)
  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Nombre <span className="text-danger">*</span>
          </label>
          <input name="name" required defaultValue={defaults?.name} className={inputCls} placeholder="ej. Quinceañeras" />
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Color</label>
            <input
              name="color"
              type="color"
              defaultValue={defaults?.color ?? "#3b82f6"}
              className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-background p-1"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-foreground">Descripción</label>
            <input name="description" defaultValue={defaults?.description ?? ""} className={inputCls} placeholder="Opcional" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Ícono</label>
          <IconSelector value={defaults?.icon} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Mensaje de agradecimiento{" "}
            <span className="font-normal text-muted-foreground">(entrega)</span>
          </label>
          <textarea
            name="thankyouMessage"
            defaultValue={defaults?.thankyouMessage ?? ""}
            rows={3}
            maxLength={2000}
            className={inputCls}
            placeholder="Ej. Gracias por dejarnos ser parte de este día tan especial…"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Aparece en la galería de entrega de las sesiones de esta categoría,
            cuando la sesión no lleva dedicatoria de la madre (o la madre no la
            escribió). Deja vacío para usar el agradecimiento genérico.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Monto de vestido incluido (por defecto)
          </label>
          <input
            name="dressIncludedAmount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={defaults?.dressIncludedAmount ?? ""}
            className={inputCls}
            placeholder="ej. 17000"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Monto de vestido incluido para los planes de esta categoría. Cada plan
            lo puede sobrescribir. Vacío = sin monto por defecto.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
          />
          Categoría activa
        </label>
        <input type="hidden" name="isActive" value={active ? "true" : "false"} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
          >
            {pending ? "Guardando..." : defaults ? "Actualizar" : "Crear categoría"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-muted px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
