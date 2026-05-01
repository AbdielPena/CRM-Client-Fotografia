"use client"

import { useState, useTransition } from "react"
import { createPackageAction, updatePackageAction, deletePackageAction } from "@/server/actions/package.actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { formatCurrency } from "@/lib/utils/currency"
import { Plus, Pencil, Trash2, Clock, Image, Check, X, Link as LinkIcon, Copy, ExternalLink } from "lucide-react"
import { toast } from "sonner"

interface Package {
  id: string
  name: string
  slug?: string
  description?: string
  price: number
  currency: string
  durationHours?: number
  editedPhotos?: number
  includes?: string
  isActive: boolean
}

interface PackageManagerProps {
  packages: Package[]
  studioSlug?: string
}

type FormMode = "create" | "edit" | null

export function PackageManager({
  packages: initialPackages,
  studioSlug = "",
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

  const handleUpdate = (packageId: string, e: React.FormEvent<HTMLFormElement>) => {
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
    <div className="max-w-4xl space-y-4">
      {/* Package list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            className={`bg-white rounded-xl border p-5 relative ${
              pkg.isActive ? "border-gray-200" : "border-gray-100 opacity-60"
            }`}
          >
            {/* Active indicator */}
            <div className="absolute top-3 right-3">
              {pkg.isActive ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <Check className="h-3 w-3" /> Activo
                </span>
              ) : (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  Inactivo
                </span>
              )}
            </div>

            <h3 className="font-semibold text-gray-900 pr-20 truncate">{pkg.name}</h3>
            <p className="text-2xl font-bold text-gray-900 mt-2">
              {formatCurrency(pkg.price, pkg.currency)}
            </p>

            {pkg.description && (
              <p className="text-xs text-gray-500 mt-2 line-clamp-2">{pkg.description}</p>
            )}

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
              {pkg.durationHours && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {pkg.durationHours}h
                </span>
              )}
              {pkg.editedPhotos && (
                <span className="flex items-center gap-1">
                  <Image className="h-3.5 w-3.5" />
                  {pkg.editedPhotos} fotos
                </span>
              )}
            </div>

            {pkg.includes && (
              <div className="mt-3 pt-3 border-t border-gray-50">
                <p className="text-xs text-gray-500 line-clamp-3 whitespace-pre-line">
                  {pkg.includes}
                </p>
              </div>
            )}

            {/* Enlace público — solo si hay slug y studio */}
            {pkg.slug && studioSlug && (
              <div className="mt-3 pt-3 border-t border-gray-50">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-1">
                  <LinkIcon className="h-3 w-3" />
                  <span className="uppercase tracking-wide font-medium">
                    Enlace público
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <code className="flex-1 px-2 py-1 bg-gray-50 rounded text-[11px] text-gray-600 truncate font-mono">
                    /p/{studioSlug}/{pkg.slug}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(pkg.slug)}
                    title="Copiar enlace"
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={`/p/${studioSlug}/${pkg.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir en nueva pestaña"
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
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
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
                <button className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
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
            className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 p-5 hover:border-gray-300 hover:bg-gray-100 transition-all flex flex-col items-center justify-center gap-2 min-h-[160px]"
          >
            <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
              <Plus className="h-5 w-5 text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-600">Nuevo paquete</p>
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
        />
      )}

      {/* Edit form */}
      {formMode === "edit" && editingPackage && (
        <PackageForm
          onSubmit={(e) => handleUpdate(editingPackage.id, e)}
          onCancel={() => { setFormMode(null); setEditingId(null) }}
          isPending={isPending}
          title={`Editando: ${editingPackage.name}`}
          defaultValues={editingPackage}
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
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  isPending: boolean
  title: string
  defaultValues?: Package
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <button type="button" onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            required
            defaultValue={defaultValues?.name}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            placeholder="ej. Paquete Premium"
          />
        </div>

        {/* Slug solo en edición — en create se auto-genera del nombre */}
        {defaultValues && (
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slug (URL pública)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 whitespace-nowrap">
                /p/…/
              </span>
              <input
                name="slug"
                defaultValue={defaultValues.slug ?? ""}
                pattern="[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?"
                title="Solo minúsculas, números y guiones (2–80 caracteres)"
                className="flex-1 px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                placeholder="paquete-premium"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Cambiar el slug rompe enlaces previamente compartidos. Úsalo con cuidado.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Precio <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={defaultValues?.price}
              className="w-full pl-7 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
          <select
            name="currency"
            defaultValue={defaultValues?.currency ?? "USD"}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
          >
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
            <option value="EUR">EUR</option>
            <option value="COP">COP</option>
            <option value="ARS">ARS</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Duración (horas)
          </label>
          <input
            name="durationHours"
            type="number"
            min="0"
            step="0.5"
            defaultValue={defaultValues?.durationHours}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            placeholder="ej. 4"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fotos editadas
          </label>
          <input
            name="editedPhotos"
            type="number"
            min="0"
            defaultValue={defaultValues?.editedPhotos}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            placeholder="ej. 100"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <input
            name="description"
            defaultValue={defaultValues?.description}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            placeholder="Breve descripción del paquete"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ¿Qué incluye?
          </label>
          <textarea
            name="includes"
            rows={3}
            defaultValue={defaultValues?.includes}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
            placeholder="- Sesión en estudio&#10;- Galería digital privada&#10;- 1 impresión tamaño carta"
          />
        </div>

        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {isPending ? "Guardando..." : defaultValues ? "Actualizar" : "Crear paquete"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
