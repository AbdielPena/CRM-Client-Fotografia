"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  createFormTemplateAction,
  updateFormTemplateAction,
  deleteFormTemplateAction,
} from "@/server/actions/form.actions"
import type { FormField, FormFieldType, FormSchema } from "@/lib/forms/types"
import {
  Plus,
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
} from "lucide-react"

interface Props {
  mode: "create" | "edit"
  templateId?: string
  initial?: {
    name: string
    description: string
    isActive: boolean
    isDefault: boolean
    schema: FormSchema
  }
}

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Texto corto" },
  { value: "textarea", label: "Texto largo" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Teléfono" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Lista desplegable" },
  { value: "radio", label: "Opción única (radio)" },
  { value: "checkbox", label: "Casilla de verificación" },
  { value: "file", label: "Archivo (próximamente)" },
]

const TYPES_WITH_OPTIONS: FormFieldType[] = ["select", "radio"]

function genKey(label: string, existing: string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "campo"
  let candidate = base
  let i = 2
  while (existing.includes(candidate)) {
    candidate = `${base}_${i++}`
  }
  return candidate
}

export function FormTemplateEditor({ mode, templateId, initial }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false)
  const [fields, setFields] = useState<FormField[]>(initial?.schema?.fields ?? [])
  const [expanded, setExpanded] = useState<string | null>(
    initial?.schema?.fields?.[0]?.key ?? null,
  )

  const keys = useMemo(() => fields.map((f) => f.key), [fields])

  function addField() {
    const key = genKey("campo", keys)
    const next: FormField = {
      key,
      label: "Nuevo campo",
      type: "text",
      required: false,
    }
    setFields((f) => [...f, next])
    setExpanded(key)
  }

  function updateField(idx: number, patch: Partial<FormField>) {
    setFields((curr) =>
      curr.map((f, i) => (i === idx ? ({ ...f, ...patch } as FormField) : f)),
    )
  }

  function removeField(idx: number) {
    setFields((curr) => curr.filter((_, i) => i !== idx))
  }

  function moveField(idx: number, dir: -1 | 1) {
    setFields((curr) => {
      const next = [...curr]
      const target = idx + dir
      if (target < 0 || target >= next.length) return curr
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  function duplicateField(idx: number) {
    setFields((curr) => {
      const orig = curr[idx]
      const newKey = genKey(orig.label + " copia", curr.map((f) => f.key))
      const copy: FormField = { ...orig, key: newKey }
      const next = [...curr]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  function buildSchema(): FormSchema {
    return {
      version: 1,
      description: undefined,
      fields,
    }
  }

  function validateLocally(): string | null {
    if (!name.trim()) return "Falta el nombre de la plantilla"
    if (fields.length === 0) return "Agrega al menos un campo"
    const seen = new Set<string>()
    for (const f of fields) {
      if (!f.key.trim()) return `Un campo no tiene clave`
      if (!/^[a-z0-9_]+$/i.test(f.key))
        return `Clave inválida "${f.key}" (solo letras, números y guion bajo)`
      if (seen.has(f.key)) return `Clave duplicada: "${f.key}"`
      seen.add(f.key)
      if (!f.label.trim()) return `El campo "${f.key}" no tiene etiqueta`
      if (TYPES_WITH_OPTIONS.includes(f.type)) {
        if (!f.options || f.options.length === 0)
          return `"${f.label}" necesita opciones`
        for (const o of f.options) {
          if (!o.label.trim() || !o.value.trim())
            return `Opciones inválidas en "${f.label}"`
        }
      }
    }
    return null
  }

  function handleSubmit() {
    const err = validateLocally()
    if (err) {
      toast.error(err)
      return
    }

    const fd = new FormData()
    fd.set("name", name.trim())
    fd.set("description", description.trim())
    fd.set("isActive", isActive ? "true" : "false")
    fd.set("isDefault", isDefault ? "true" : "false")
    fd.set("schema", JSON.stringify(buildSchema()))

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createFormTemplateAction(fd)
          : await updateFormTemplateAction(templateId!, fd)

      if (result?.error) {
        const msg =
          Object.values(result.error).flat().filter(Boolean).join(" — ") ||
          "No pudimos guardar la plantilla"
        toast.error(msg)
        return
      }

      toast.success(
        mode === "create" ? "Plantilla creada" : "Plantilla guardada",
      )

      const newId =
        mode === "create"
          ? (result as { templateId?: string } | undefined)?.templateId
          : undefined
      if (newId) {
        router.push(`/settings/forms/${newId}`)
      } else {
        router.refresh()
      }
    })
  }

  function handleDelete() {
    if (!templateId) return
    if (
      !confirm(
        "¿Eliminar esta plantilla? Las respuestas existentes no se borran.",
      )
    )
      return
    startTransition(async () => {
      await deleteFormTemplateAction(templateId)
      toast.success("Plantilla eliminada")
      router.push("/settings/forms")
    })
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Meta */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre de la plantilla *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cuestionario XV años"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descripción interna
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Para qué tipo de sesión es este formulario"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-gray-700">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Plantilla activa
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Marcar como predeterminada
          </label>
        </div>
      </section>

      {/* Fields */}
      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Campos</h2>
          <button
            type="button"
            onClick={addField}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          >
            <Plus className="h-3 w-3" /> Agregar campo
          </button>
        </div>

        {fields.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-500 text-center">
            Aún no hay campos. Comienza agregando uno.
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {fields.map((field, idx) => {
              const open = expanded === field.key
              return (
                <li key={field.key} className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-gray-300" />
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : field.key)}
                      className="flex-1 text-left flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {field.label}
                          {field.required && (
                            <span className="text-red-500"> *</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">
                          {field.type} · {field.key}
                        </p>
                      </div>
                      {open ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveField(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                        title="Subir"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(idx, 1)}
                        disabled={idx === fields.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                        title="Bajar"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateField(idx)}
                        className="p-1 text-gray-400 hover:text-gray-700"
                        title="Duplicar"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeField(idx)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 ml-6 space-y-3 bg-gray-50 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Etiqueta
                          </label>
                          <input
                            value={field.label}
                            onChange={(e) =>
                              updateField(idx, { label: e.target.value })
                            }
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Clave (único, sin espacios)
                          </label>
                          <input
                            value={field.key}
                            onChange={(e) =>
                              updateField(idx, { key: e.target.value })
                            }
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Tipo
                          </label>
                          <select
                            value={field.type}
                            onChange={(e) =>
                              updateField(idx, {
                                type: e.target.value as FormFieldType,
                              })
                            }
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          >
                            {FIELD_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Placeholder
                          </label>
                          <input
                            value={field.placeholder ?? ""}
                            onChange={(e) =>
                              updateField(idx, {
                                placeholder: e.target.value || undefined,
                              })
                            }
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Texto de ayuda
                        </label>
                        <input
                          value={field.help ?? ""}
                          onChange={(e) =>
                            updateField(idx, {
                              help: e.target.value || undefined,
                            })
                          }
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={field.required ?? false}
                          onChange={(e) =>
                            updateField(idx, { required: e.target.checked })
                          }
                        />
                        Campo requerido
                      </label>

                      {TYPES_WITH_OPTIONS.includes(field.type) && (
                        <OptionsEditor
                          options={field.options ?? []}
                          onChange={(options) => updateField(idx, { options })}
                        />
                      )}

                      {field.type === "number" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Mínimo
                            </label>
                            <input
                              type="number"
                              value={field.min ?? ""}
                              onChange={(e) =>
                                updateField(idx, {
                                  min:
                                    e.target.value === ""
                                      ? undefined
                                      : Number(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Máximo
                            </label>
                            <input
                              type="number"
                              value={field.max ?? ""}
                              onChange={(e) =>
                                updateField(idx, {
                                  max:
                                    e.target.value === ""
                                      ? undefined
                                      : Number(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md"
                            />
                          </div>
                        </div>
                      )}

                      <VisibleIfEditor
                        field={field}
                        allFields={fields}
                        onChange={(visibleIf) =>
                          updateField(idx, { visibleIf })
                        }
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-3">
        {mode === "edit" && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40"
          >
            Eliminar plantilla
          </button>
        )}
        <div className="flex gap-3 ml-auto">
          <button
            type="button"
            onClick={() => router.push("/settings/forms")}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40"
          >
            {isPending
              ? "Guardando…"
              : mode === "create"
                ? "Crear plantilla"
                : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  )
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string }[]
  onChange: (next: { value: string; label: string }[]) => void
}) {
  function add() {
    const idx = options.length + 1
    onChange([...options, { value: `opcion_${idx}`, label: `Opción ${idx}` }])
  }
  function update(i: number, patch: Partial<{ value: string; label: string }>) {
    onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)))
  }
  function remove(i: number) {
    onChange(options.filter((_, j) => j !== i))
  }

  return (
    <div className="border-t border-gray-200 pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">Opciones</span>
        <button
          type="button"
          onClick={add}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          + Agregar opción
        </button>
      </div>
      {options.length === 0 ? (
        <p className="text-xs text-gray-400">Aún no hay opciones</p>
      ) : (
        <ul className="space-y-2">
          {options.map((o, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                value={o.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Etiqueta visible"
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-md"
              />
              <input
                value={o.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="valor_interno"
                className="w-40 px-2 py-1.5 text-sm border border-gray-200 rounded-md font-mono"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="p-1 text-gray-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function VisibleIfEditor({
  field,
  allFields,
  onChange,
}: {
  field: FormField
  allFields: FormField[]
  onChange: (next: FormField["visibleIf"]) => void
}) {
  const enabled = !!field.visibleIf
  const eligibleSources = allFields.filter(
    (f) => f.key !== field.key && TYPES_WITH_OPTIONS.includes(f.type),
  )

  return (
    <div className="border-t border-gray-200 pt-3">
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? {
                    key: eligibleSources[0]?.key ?? "",
                    equals: "",
                  }
                : undefined,
            )
          }
        />
        Mostrar solo si otro campo tiene un valor específico
      </label>
      {enabled && (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={field.visibleIf?.key ?? ""}
            onChange={(e) =>
              onChange({
                key: e.target.value,
                equals: field.visibleIf?.equals ?? "",
              })
            }
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-md"
          >
            <option value="">— campo —</option>
            {eligibleSources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} ({s.key})
              </option>
            ))}
          </select>
          <input
            value={field.visibleIf?.equals ?? ""}
            onChange={(e) =>
              onChange({
                key: field.visibleIf?.key ?? "",
                equals: e.target.value,
              })
            }
            placeholder="igual a…"
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-md font-mono"
          />
        </div>
      )}
    </div>
  )
}
