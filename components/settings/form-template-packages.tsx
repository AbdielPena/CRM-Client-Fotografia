"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Package as PackageIcon } from "lucide-react"
import { setFormTemplatePackagesAction } from "@/server/actions/form.actions"

interface PackageOption {
  id: string
  name: string
  isActive: boolean
}

interface Props {
  templateId: string
  packages: PackageOption[]
  initialSelectedIds: string[]
}

/**
 * Selector de paquetes a los que se aplica este formulario.
 * Cuando un cliente reserva un paquete vinculado, el formulario se
 * crea automáticamente como `pending` (ver createFormResponsesForBooking).
 */
export function FormTemplatePackages({
  templateId,
  packages,
  initialSelectedIds,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialSelectedIds),
  )
  const [isPending, startTransition] = useTransition()

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function save() {
    startTransition(async () => {
      const result = await setFormTemplatePackagesAction(
        templateId,
        [...selected],
      )
      if (result?.success) {
        toast.success("Vinculación actualizada")
      } else {
        toast.error("No pudimos guardar")
      }
    })
  }

  const dirty =
    selected.size !== initialSelectedIds.length ||
    [...selected].some((id) => !initialSelectedIds.includes(id))

  return (
    <section className="bg-card rounded-xl border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Paquetes vinculados
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cuando alguien reserve uno de estos paquetes, este formulario se
            envía automáticamente.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={isPending || !dirty}
          className="px-3 py-1.5 text-xs bg-brand text-brand-foreground rounded-lg hover:bg-brand/90 disabled:opacity-40"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {packages.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground text-center">
          Aún no tienes paquetes activos. Crea uno en{" "}
          <a
            href="/settings/packages"
            className="text-brand hover:underline"
          >
            Paquetes
          </a>
          .
        </p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {packages.map((pkg) => {
            const checked = selected.has(pkg.id)
            return (
              <li key={pkg.id} className="px-5 py-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(pkg.id)}
                    className="h-4 w-4"
                  />
                  <PackageIcon className="h-4 w-4 text-muted-foreground" />
                  <span
                    className={`text-sm ${
                      pkg.isActive ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {pkg.name}
                    {!pkg.isActive && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (inactivo)
                      </span>
                    )}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
