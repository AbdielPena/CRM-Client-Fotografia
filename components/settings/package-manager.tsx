"use client"

import { useState, useTransition } from "react"
import {
  createPackageAction,
  updatePackageAction,
  deletePackageAction,
} from "@/server/actions/package.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { formatCurrency } from "@/lib/utils/currency"
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  Image as ImageIcon,
  Check,
  X,
  Link as LinkIcon,
  Copy,
  ExternalLink,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils/cn"

interface Package {
  id: string
  name: string
  slug?: string
  description?: string
  price: number
  currency: string
  durationHours?: number
  editedPhotos?: number
  deliveryDays?: number
  includes?: string
  isActive: boolean
  contractTemplateId?: string
  formTemplateId?: string
}

interface TemplateOption {
  id: string
  name: string
}

interface PackageManagerProps {
  packages: Package[]
  studioSlug?: string
  contractTemplates?: TemplateOption[]
  formTemplates?: TemplateOption[]
}

type FormMode = "create" | "edit" | null

export function PackageManager({
  packages: initialPackages,
  studioSlug = "",
  contractTemplates = [],
  formTemplates = [],
}: PackageManagerProps) {
  const [packages, setPackages] = useState(initialPackages)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const buildPublicUrl = (slug?: string) => {
    if (!slug || !studioSlug) return ""
    if (typeof window === "undefined") return `/p/${studioSlug}/${slug}`
    return `${window.location.origin}/p/${studioSlug}/${slug}`
  }

  const handleCopyUrl = async (slug?: string) => {
    const url = buildPublicUrl(slug)
    if (!url) {
      toast.error("No se pudo generar el enlace público")
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Enlace copiado")
    } catch {
      toast.error("No se pudo copiar — copia manualmente")
    }
  }

  const editingPackage = packages.find((p) => p.id === editingId)

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createPackageAction(fd)
      if (result?.success) {
        toast.success("Paquete creado")
        setFormMode(null)
        ;(e.target as HTMLFormElement).reset()
      }
    })
  }

  const handleUpdate = (
    packageId: string,
    e: React.FormEvent<HTMLFormElement>,
  ) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updatePackageAction(packageId, fd)
      if (result?.success) {
        toast.success("Paquete actualizado")
        setFormMode(null)
        setEditingId(null)
      }
    })
  }

  const handleDelete = async (packageId: string) => {
    const result = await deletePackageAction(packageId)
    if (result?.success) {
      setPackages((prev) => prev.filter((p) => p.id !== packageId))
      toast.success("Paquete eliminado")
    }
  }

  return (
    <div className="max-w-5xl space-y-4">
      {/* Package list */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            className={cn(
              "relative rounded-xl border bg-card p-5 transition-colors duration-fast",
              pkg.isActive
                ? "border-border hover:border-border-strong"
                : "border-border/60 opacity-60",
            )}
          >
            {/* Active indicator */}
            <div className="absolute right-3 top-3">
              {pkg.isActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <Check className="h-3 w-3" /> Activo
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  Inactivo
                </span>
              )}
            </div>

            <h3 className="truncate pr-20 text-sm font-semibold text-foreground">
              {pkg.name}
            </h3>
            <p className="mt-2 text-2xl font-bold text-foreground tabular-nums tracking-tight">
              {formatCurrency(pkg.price, pkg.currency)}
            </p>

            {pkg.description && (
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                {pkg.description}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {pkg.durationHours && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {pkg.durationHours}h
                </span>
              )}
              {pkg.editedPhotos && (
                <span className="flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {pkg.editedPhotos} fotos
                </span>
              )}
            </div>

            {pkg.includes && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
                  {pkg.includes}
                </p>
              </div>
            )}

            {/* Enlace público */}
            {pkg.slug && studioSlug && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                  <LinkIcon className="h-3 w-3" />
                  <span>Enlace público</span>
                </div>
                <div className="flex items-center gap-1">
                  <code className="flex-1 truncate rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    /p/{studioSlug}/{pkg.slug}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(pkg.slug)}
                    title="Copiar enlace"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={`/p/${studioSlug}/${pkg.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir en nueva pestaña"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingId(pkg.id)
                  setFormMode("edit")
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
              <ConfirmDialog
                title="Eliminar paquete"
                description={`¿Eliminar el paquete "${pkg.name}"?`}
                confirmLabel="Eliminar"
                danger
                onConfirm={() => handleDelete(pkg.id)}
              >
                <button className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </ConfirmDialog>
            </div>
          </div>
        ))}

        {/* Add new card */}
        {formMode !== "create" && (
          <button
            onClick={() => setFormMode("create")}
            className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/50 p-5 transition-colors hover:border-border-strong hover:bg-muted"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Nuevo paquete
            </p>
          </button>
        )}
      </div>

      {/* Create form */}
      {formMode === "create" && (
        <PackageForm
          onSubmit={handleCreate}
          onCancel={() => setFormMode(null)}
          isPending={isPending}
          title="Nuevo paquete"
          contractTemplates={contractTemplates}
          formTemplates={formTemplates}
        />
      )}

      {/* Edit form */}
      {formMode === "edit" && editingPackage && (
        <PackageForm
          onSubmit={(e) => handleUpdate(editingPackage.id, e)}
          onCancel={() => {
            setFormMode(null)
            setEditingId(null)
          }}
          isPending={isPending}
          title={`Editando: ${editingPackage.name}`}
          defaultValues={editingPackage}
          contractTemplates={contractTemplates}
          formTemplates={formTemplates}
        />
      )}
    </div>
  )
}

function PackageForm({
  onSubmit,
  onCancel,
  isPending,
  title,
  defaultValues,
  contractTemplates = [],
  formTemplates = [],
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  isPending: boolean
  title: string
  defaultValues?: Package
  contractTemplates?: TemplateOption[]
  formTemplates?: TemplateOption[]
}) {
  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Nombre <span className="text-danger">*</span>
          </label>
          <input
            name="name"
            required
            defaultValue={defaultValues?.name}
            className={inputCls}
            placeholder="ej. Paquete Premium"
          />
        </div>

        {defaultValues && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-foreground">
              Slug (URL pública)
            </label>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                /p/…/
              </span>
              <input
                name="slug"
                defaultValue={defaultValues.slug ?? ""}
                pattern="[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?"
                title="Solo minúsculas, números y guiones (2–80 caracteres)"
                className={cn(inputCls, "flex-1 font-mono")}
                placeholder="paquete-premium"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cambiar el slug rompe enlaces previamente compartidos.
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Precio <span className="text-danger">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={defaultValues?.price}
              className={cn(inputCls, "pl-7")}
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Moneda
          </label>
          <select
            name="currency"
            defaultValue={defaultValues?.currency ?? "USD"}
            className={inputCls}
          >
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
            <option value="EUR">EUR</option>
            <option value="COP">COP</option>
            <option value="ARS">ARS</option>
            <option value="DOP">DOP</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Duración (horas)
          </label>
          <input
            name="durationHours"
            type="number"
            min="0"
            step="0.5"
            defaultValue={defaultValues?.durationHours}
            className={inputCls}
            placeholder="ej. 4"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Fotos editadas
          </label>
          <input
            name="editedPhotos"
            type="number"
            min="0"
            defaultValue={defaultValues?.editedPhotos}
            className={inputCls}
            placeholder="ej. 100"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Tiempo estimado de entrega (días)
          </label>
          <input
            name="deliveryDays"
            type="number"
            min="0"
            max="365"
            defaultValue={defaultValues?.deliveryDays}
            className={inputCls}
            placeholder="ej. 21"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Días para entregar tras la sesión. El sistema calcula la fecha de
            entrega y prioriza según el cumpleaños. Déjalo vacío si no aplica.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Descripción
          </label>
          <input
            name="description"
            defaultValue={defaultValues?.description}
            className={inputCls}
            placeholder="Breve descripción del paquete"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-foreground">
            ¿Qué incluye?
          </label>
          <textarea
            name="includes"
            rows={3}
            defaultValue={defaultValues?.includes}
            className={cn(inputCls, "resize-none")}
            placeholder="- Sesión en estudio&#10;- Galería digital privada&#10;- 1 impresión tamaño carta"
          />
        </div>

        {/* Vinculación a contrato + formulario — se aplican por defecto cuando
            un cliente reserva este paquete */}
        <div className="sm:col-span-2 mt-1 border-t border-border/60 pt-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Documentos vinculados al paquete
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Plantilla de contrato
          </label>
          <select
            name="contractTemplateId"
            defaultValue={defaultValues?.contractTemplateId ?? ""}
            className={inputCls}
          >
            <option value="">— Ninguno —</option>
            {contractTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {contractTemplates.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              No hay plantillas.{" "}
              <a href="/settings/contracts" className="text-brand hover:underline">
                Crear una
              </a>
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Formulario
          </label>
          <select
            name="formTemplateId"
            defaultValue={defaultValues?.formTemplateId ?? ""}
            className={inputCls}
          >
            <option value="">— Ninguno —</option>
            {formTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {formTemplates.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              No hay formularios.{" "}
              <a href="/settings/forms" className="text-brand hover:underline">
                Crear uno
              </a>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
          >
            {isPending ? "Guardando..." : defaultValues ? "Actualizar" : "Crear paquete"}
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
