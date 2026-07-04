"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  createPackageAction,
  updatePackageAction,
  deletePackageAction,
  packageDeleteImpactAction,
} from "@/server/actions/package.actions"
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
  AlertTriangle,
  Loader2,
  UploadCloud,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils/cn"
import { PrintEntitlementsEditor } from "./print-entitlements-editor"
import { CollaboratorRequirementsEditor } from "./collaborator-requirements-editor"
import { CategoryIcon } from "@/components/shared/icon-selector"
import type { PrintEntitlements } from "@/lib/print/entitlements"
import type { CollaboratorRequirement } from "@/lib/collaborators/requirements"

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
  balanceDueOffsetDays?: number
  includesDress?: boolean
  includes?: string
  isActive: boolean
  contractTemplateId?: string
  formTemplateId?: string
  serviceCategoryId?: string
  coverImageUrl?: string
  printEntitlements?: PrintEntitlements
  collaboratorRequirements?: CollaboratorRequirement[]
}

interface TemplateOption {
  id: string
  name: string
}

interface CategoryOption {
  id: string
  name: string
  color: string
  icon: string
}

interface PackageManagerProps {
  packages: Package[]
  studioSlug?: string
  contractTemplates?: TemplateOption[]
  formTemplates?: TemplateOption[]
  serviceCategories?: CategoryOption[]
}

type FormMode = "create" | "edit" | null

export function PackageManager({
  packages: initialPackages,
  studioSlug = "",
  contractTemplates = [],
  formTemplates = [],
  serviceCategories = [],
}: PackageManagerProps) {
  const router = useRouter()
  const [packages, setPackages] = useState(initialPackages)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingPkg, setDeletingPkg] = useState<Package | null>(null)
  const [isPending, startTransition] = useTransition()

  // Mantiene la lista local sincronizada cuando el server re-renderiza tras
  // crear/editar/eliminar (revalidate / router.refresh) → la card refleja el cambio.
  useEffect(() => {
    setPackages(initialPackages)
  }, [initialPackages])

  const closeForm = useCallback(() => {
    setFormMode(null)
    setEditingId(null)
  }, [])

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

  // Agrupa los paquetes por categoría de servicio (en el orden de las categorías).
  // Sin categorías definidas → un solo grupo plano (comportamiento legacy).
  const categoryById = new Map(serviceCategories.map((c) => [c.id, c]))
  const packageGroups: {
    key: string
    header: React.ReactNode
    items: Package[]
  }[] =
    serviceCategories.length === 0
      ? [{ key: "__all__", header: null, items: packages }]
      : (() => {
          const groups: { key: string; header: React.ReactNode; items: Package[] }[] = []
          for (const cat of serviceCategories) {
            const items = packages.filter((p) => p.serviceCategoryId === cat.id)
            if (items.length === 0) continue
            groups.push({
              key: cat.id,
              header: <CategoryHeader category={cat} count={items.length} />,
              items,
            })
          }
          const uncategorized = packages.filter(
            (p) => !p.serviceCategoryId || !categoryById.has(p.serviceCategoryId),
          )
          if (uncategorized.length > 0) {
            groups.push({
              key: "__none__",
              header: <CategoryHeader count={uncategorized.length} />,
              items: uncategorized,
            })
          }
          return groups
        })()

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createPackageAction(fd)
      if (result?.success) {
        toast.success("Paquete creado")
        closeForm()
        router.refresh()
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
        closeForm()
        router.refresh()
      }
    })
  }

  const handleDelete = async (packageId: string) => {
    const result = await deletePackageAction(packageId)
    if (result?.success) {
      setPackages((prev) => prev.filter((p) => p.id !== packageId))
      setDeletingPkg(null)
      toast.success("Paquete eliminado")
      router.refresh()
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Package list — agrupada por categoría de servicio */}
      {packageGroups.map((group) => (
        <div key={group.key} className="space-y-3">
          {group.header}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((pkg) => (
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
              <button
                onClick={() => setDeletingPkg(pkg)}
                title="Eliminar paquete"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
            ))}
          </div>
        </div>
      ))}

      {/* Add new card — siempre visible (el formulario ahora es una ventana modal) */}
      <button
        onClick={() => {
          setEditingId(null)
          setFormMode("create")
        }}
        className="flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/50 p-5 transition-colors hover:border-border-strong hover:bg-muted sm:max-w-xs"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Plus className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Nuevo paquete</p>
      </button>

      {/* Ventana modal de crear / editar paquete */}
      {(formMode === "create" || (formMode === "edit" && editingPackage)) && (
        <Modal onClose={closeForm}>
          <PackageForm
            onSubmit={
              formMode === "edit" && editingPackage
                ? (e) => handleUpdate(editingPackage.id, e)
                : handleCreate
            }
            onCancel={closeForm}
            isPending={isPending}
            title={
              formMode === "edit" && editingPackage
                ? `Editando: ${editingPackage.name}`
                : "Nuevo paquete"
            }
            defaultValues={formMode === "edit" ? editingPackage : undefined}
            contractTemplates={contractTemplates}
            formTemplates={formTemplates}
            serviceCategories={serviceCategories}
          />
        </Modal>
      )}

      {/* Confirmación fuerte de eliminación (impacto en cascada + escribir el nombre) */}
      {deletingPkg && (
        <Modal onClose={() => setDeletingPkg(null)}>
          <DangerDeletePackageDialog
            pkg={deletingPkg}
            onCancel={() => setDeletingPkg(null)}
            onConfirm={() => handleDelete(deletingPkg.id)}
          />
        </Modal>
      )}
    </div>
  )
}

/** Diálogo de eliminación con doble seguro: muestra el impacto real en cascada
 *  (proyectos/galerías/facturas que se irían) y exige escribir el nombre del
 *  paquete para habilitar el botón. Así no se puede eliminar por error. */
function DangerDeletePackageDialog({
  pkg,
  onCancel,
  onConfirm,
}: {
  pkg: Package
  onCancel: () => void
  onConfirm: () => void
}) {
  const [impact, setImpact] = useState<{
    projects: number
    galleries: number
    invoices: number
    projectNames: string[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [typed, setTyped] = useState("")
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    packageDeleteImpactAction(pkg.id)
      .then((r) => {
        if (r.ok) setImpact(r.impact)
      })
      .finally(() => setLoading(false))
  }, [pkg.id])

  const nameMatches = typed.trim() === pkg.name.trim()
  const hasCascade = (impact?.projects ?? 0) > 0

  return (
    <div className="rounded-xl border border-danger/40 bg-card p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            Eliminar &quot;{pkg.name}&quot;
          </h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Esta acción no se puede deshacer desde aquí.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calculando qué se vería afectado…
        </div>
      ) : hasCascade ? (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
          <p className="text-[13px] font-semibold text-danger">
            ⚠️ Este paquete está EN USO. Eliminarlo borrará también:
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-foreground">
            <li>
              • <strong>{impact!.projects}</strong> proyecto{impact!.projects === 1 ? "" : "s"}
              {impact!.projectNames.length > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  ({impact!.projectNames.join(", ")}
                  {impact!.projects > impact!.projectNames.length ? "…" : ""})
                </span>
              )}
            </li>
            {impact!.galleries > 0 && (
              <li>
                • <strong>{impact!.galleries}</strong> galería{impact!.galleries === 1 ? "" : "s"} (con
                las selecciones de tus clientes)
              </li>
            )}
            {impact!.invoices > 0 && (
              <li>
                • <strong>{impact!.invoices}</strong> factura{impact!.invoices === 1 ? "" : "s"} con sus
                pagos
              </li>
            )}
            <li>• Contratos, notas y formularios de esos proyectos</li>
          </ul>
          <p className="mt-2 text-[12px] text-muted-foreground">
            💡 Si solo quieres retirarlo del catálogo, mejor edítalo y márcalo{" "}
            <strong>inactivo</strong> — conserva los proyectos e historial.
          </p>
        </div>
      ) : (
        <div className="rounded-lg bg-muted/40 px-4 py-3 text-[12.5px] text-muted-foreground">
          Este paquete no tiene proyectos vinculados — eliminarlo no afecta nada más.
        </div>
      )}

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Para confirmar, escribe el nombre exacto del paquete:
        </label>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={pkg.name}
          autoFocus
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/20"
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={!nameMatches || loading || deleting}
          onClick={() => {
            setDeleting(true)
            onConfirm()
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-danger px-5 py-2.5 text-sm font-medium text-danger-foreground transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Eliminar definitivamente
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-muted px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

/** Ventana modal centrada con backdrop, cierre por Escape / clic afuera, y
 *  bloqueo de scroll del body mientras está abierta. */
function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative flex min-h-full items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
          className="relative w-full max-w-2xl"
          role="dialog"
          aria-modal="true"
        >
          {children}
        </motion.div>
      </div>
    </div>
  )
}

function CategoryHeader({
  category,
  count,
}: {
  category?: CategoryOption
  count: number
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
        style={{ backgroundColor: category?.color ?? "#94a3b8" }}
      >
        <CategoryIcon name={category?.icon ?? "tag"} className="h-3.5 w-3.5" />
      </span>
      <h3 className="text-sm font-semibold text-foreground">
        {category?.name ?? "Sin categoría"}
      </h3>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        {count}
      </span>
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
  serviceCategories = [],
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  isPending: boolean
  title: string
  defaultValues?: Package
  contractTemplates?: TemplateOption[]
  formTemplates?: TemplateOption[]
  serviceCategories?: CategoryOption[]
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

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Categoría de servicio
          </label>
          <select
            name="serviceCategoryId"
            defaultValue={defaultValues?.serviceCategoryId ?? ""}
            className={inputCls}
          >
            <option value="">— Sin categoría —</option>
            {serviceCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Agrupa este plan y define su carpeta raíz en Google Drive.{" "}
            <a href="/settings/service-categories" className="text-brand hover:underline">
              Gestionar categorías
            </a>
          </p>
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
            Vencimiento del saldo (2da factura)
          </label>
          <select
            name="balanceDueOffsetDays"
            defaultValue={String(defaultValues?.balanceDueOffsetDays ?? 0)}
            className={inputCls}
          >
            <option value="0">El día de la sesión de fotos</option>
            <option value="-1">1 día antes de la sesión</option>
            <option value="-2">2 días antes de la sesión</option>
            <option value="-3">3 días antes de la sesión</option>
            <option value="-7">1 semana antes de la sesión</option>
            <option value="1">1 día después de la sesión</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Cuándo vence la factura de saldo (el resto a pagar). Se calcula
            automáticamente a partir de la fecha de la sesión reservada. La
            reserva (1ra factura) usa sus propios días de vencimiento.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              name="includesDress"
              value="true"
              defaultChecked={defaultValues?.includesDress ?? false}
              className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
            />
            Este plan incluye el vestido
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            En los planes que incluyen el vestido (Luxury), el costo del vestido
            de la sesión se resta de la ganancia neta y se registra como gasto en
            Finanzas.
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

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Imagen de portada
          </label>
          <CoverImageField name="coverImageUrl" initialUrl={defaultValues?.coverImageUrl ?? null} />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Se muestra en el link público del plan y en la vista por categoría. PNG/JPG/WEBP, máx. 2 MB.
          </p>
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

        <PrintEntitlementsEditor defaultValue={defaultValues?.printEntitlements} />

        <CollaboratorRequirementsEditor
          defaultValue={defaultValues?.collaboratorRequirements}
        />

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

/**
 * Subida de la imagen de portada del plan: sube el archivo a
 * /api/studio/branding/logo (bucket público studio-branding, variant
 * "package-cover") y guarda la URL en un input hidden que el form persiste en
 * packages.cover_image_url. Misma mecánica que el uploader del logo.
 */
function CoverImageField({
  name,
  initialUrl,
}: {
  name: string
  initialUrl: string | null
}) {
  const [url, setUrl] = useState(initialUrl ?? "")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setErr(null)
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("variant", "package-cover")
      const res = await fetch("/api/studio/branding/logo", { method: "POST", body: fd })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error || "Error al subir")
      setUrl(json.url)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Error al subir")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={url} />
      <div className="flex items-center gap-3 rounded-xl border border-border p-3">
        <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Portada" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
              {url ? "Cambiar imagen" : "Subir portada"}
            </button>
            {url && (
              <button
                type="button"
                onClick={() => setUrl("")}
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                Quitar
              </button>
            )}
          </div>
          {err && <p className="text-[11px] text-red-600">{err}</p>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onPick}
      />
    </div>
  )
}
