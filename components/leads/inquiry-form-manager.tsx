"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Code2,
  Pencil,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react"

import type { FormField, FormFieldType, FormSchema } from "@/lib/forms/types"
import {
  createInquiryFormAction,
  updateInquiryFormAction,
  deleteInquiryFormAction,
} from "@/server/actions/inquiry-form.actions"

export type InquiryFormView = {
  id: string
  name: string
  description: string | null
  isActive: boolean
  defaultCategory: string | null
  submitLabel: string
  successMessage: string
  fields: FormField[]
}

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Texto corto" },
  { value: "textarea", label: "Texto largo" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Teléfono / WhatsApp" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Lista desplegable" },
  { value: "radio", label: "Opción única" },
  { value: "checkbox", label: "Casilla" },
  { value: "explanation", label: "Nota (solo texto)" },
]
const TYPES_WITH_OPTIONS: FormFieldType[] = ["select", "radio"]

function slugKey(label: string, existing: string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "campo"
  let c = base
  let i = 2
  while (existing.includes(c)) c = `${base}_${i++}`
  return c
}

function defaultFields(): FormField[] {
  return [
    { key: "name", type: "text", label: "Nombre", required: true, placeholder: "Tu nombre" },
    { key: "email", type: "email", label: "Email", placeholder: "tu@email.com" },
    { key: "phone", type: "tel", label: "WhatsApp", placeholder: "+1 809 ..." },
    { key: "message", type: "textarea", label: "Cuéntanos sobre tu evento" },
  ]
}

export function InquiryFormManager({
  forms,
  categories,
  origin,
}: {
  forms: InquiryFormView[]
  categories: string[]
  origin: string
}) {
  const [editing, setEditing] = useState<InquiryFormView | "new" | null>(null)
  const [snippetFor, setSnippetFor] = useState<InquiryFormView | null>(null)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {forms.length === 0
            ? "Aún no tienes formularios."
            : `${forms.length} formulario${forms.length === 1 ? "" : "s"}`}
        </p>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="size-4" /> Nuevo formulario
        </button>
      </div>

      {forms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Crea tu primer formulario y pégalo en tu web. Cada envío entra como un
            lead en este CRM.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {forms.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-foreground">{f.name}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      f.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {f.isActive ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {f.fields.filter((x) => x.type !== "explanation").length} campos
                  {f.defaultCategory ? ` · ${f.defaultCategory}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setSnippetFor(f)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                >
                  <Code2 className="size-3.5" /> Código
                </button>
                <button
                  onClick={() => setEditing(f)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                >
                  <Pencil className="size-3.5" /> Editar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <FormEditorModal
          initial={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
      {snippetFor && (
        <SnippetModal
          form={snippetFor}
          origin={origin}
          onClose={() => setSnippetFor(null)}
        />
      )}
    </div>
  )
}

// ── Snippet ──────────────────────────────────────────────────────────────────
function SnippetModal({
  form,
  origin,
  onClose,
}: {
  form: InquiryFormView
  origin: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const snippet = `<div data-pixel-form="${form.id}"></div>\n<script src="${origin}/embed/form.js" defer></script>`

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = snippet
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Modal title="Insertar en tu web" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Pega este código en cualquier página de tu sitio donde quieras que aparezca
        el formulario <strong>{form.name}</strong>. Los envíos entran como leads.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-3 text-xs leading-relaxed text-foreground">
        {snippet}
      </pre>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copiado" : "Copiar código"}
        </button>
        <a
          href={`${origin}/api/public/forms/${form.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <ExternalLink className="size-3.5" /> Ver definición
        </a>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        ID del formulario: <code className="font-mono">{form.id}</code>
      </p>
    </Modal>
  )
}

// ── Editor ───────────────────────────────────────────────────────────────────
function FormEditorModal({
  initial,
  categories,
  onClose,
}: {
  initial: InquiryFormView | null
  categories: string[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [defaultCategory, setDefaultCategory] = useState(
    initial?.defaultCategory ?? "",
  )
  const [submitLabel, setSubmitLabel] = useState(initial?.submitLabel ?? "Enviar")
  const [successMessage, setSuccessMessage] = useState(
    initial?.successMessage ?? "Gracias, te contactaremos muy pronto.",
  )
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [fields, setFields] = useState<FormField[]>(
    initial?.fields?.length ? initial.fields : defaultFields(),
  )

  const keys = useMemo(() => fields.map((f) => f.key), [fields])

  function addField() {
    const key = slugKey("campo", keys)
    setFields((f) => [...f, { key, type: "text", label: "Nuevo campo", required: false }])
  }
  function patch(idx: number, p: Partial<FormField>) {
    setFields((c) => c.map((f, i) => (i === idx ? ({ ...f, ...p } as FormField) : f)))
  }
  function remove(idx: number) {
    setFields((c) => c.filter((_, i) => i !== idx))
  }
  function move(idx: number, dir: -1 | 1) {
    setFields((c) => {
      const n = [...c]
      const t = idx + dir
      if (t < 0 || t >= n.length) return c
      ;[n[idx], n[t]] = [n[t], n[idx]]
      return n
    })
  }

  function validate(): string | null {
    if (!name.trim()) return "Falta el nombre del formulario"
    const real = fields.filter((f) => f.type !== "explanation")
    if (real.length === 0) return "Agrega al menos un campo"
    const seen = new Set<string>()
    for (const f of fields) {
      if (!/^[a-z0-9_]+$/i.test(f.key)) return `Clave inválida: "${f.key}"`
      if (seen.has(f.key)) return `Clave duplicada: "${f.key}"`
      seen.add(f.key)
      if (!f.label.trim()) return "Un campo no tiene etiqueta"
      if (TYPES_WITH_OPTIONS.includes(f.type) && (!f.options || !f.options.length))
        return `"${f.label}" necesita opciones`
    }
    const hasContact = real.some(
      (f) => ["email", "tel"].includes(f.type) ||
        ["name", "email", "phone"].includes(f.key),
    )
    if (!hasContact)
      return "Incluye al menos un campo de email o teléfono para poder contactar"
    return null
  }

  function save() {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    const schema: FormSchema = { version: 1, fields }
    const fd = new FormData()
    fd.set("name", name.trim())
    fd.set("description", description.trim())
    fd.set("defaultCategory", defaultCategory.trim())
    fd.set("submitLabel", submitLabel.trim())
    fd.set("successMessage", successMessage.trim())
    fd.set("isActive", isActive ? "true" : "false")
    fd.set("schema", JSON.stringify(schema))

    startTransition(async () => {
      const res = initial
        ? await updateInquiryFormAction(initial.id, fd)
        : await createInquiryFormAction(fd)
      if (res?.error) {
        const msg =
          Object.values(res.error).flat().filter(Boolean).join(" — ") ||
          "No se pudo guardar"
        toast.error(msg)
        return
      }
      toast.success(initial ? "Formulario guardado" : "Formulario creado")
      onClose()
      router.refresh()
    })
  }

  function del() {
    if (!initial) return
    if (!confirm("¿Eliminar este formulario? Los leads ya capturados se conservan."))
      return
    startTransition(async () => {
      await deleteInquiryFormAction(initial.id)
      toast.success("Formulario eliminado")
      onClose()
      router.refresh()
    })
  }

  return (
    <Modal
      title={initial ? "Editar formulario" : "Nuevo formulario"}
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labeled label="Nombre del formulario *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Solicitud de quinceañera"
              className={inputCls}
            />
          </Labeled>
          <Labeled label="Categoría por defecto (opcional)">
            <input
              list="pxf-cats"
              value={defaultCategory}
              onChange={(e) => setDefaultCategory(e.target.value)}
              placeholder="Bodas, Quinceañeras…"
              className={inputCls}
            />
            <datalist id="pxf-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Labeled>
        </div>
        <Labeled label="Descripción / intro (la ve el visitante)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </Labeled>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labeled label="Texto del botón">
            <input
              value={submitLabel}
              onChange={(e) => setSubmitLabel(e.target.value)}
              className={inputCls}
            />
          </Labeled>
          <Labeled label="Mensaje de gracias (tras enviar)">
            <input
              value={successMessage}
              onChange={(e) => setSuccessMessage(e.target.value)}
              className={inputCls}
            />
          </Labeled>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Formulario activo (visible en la web)
        </label>

        {/* Campos */}
        <div className="rounded-xl border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Campos</span>
            <button
              onClick={addField}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
            >
              <Plus className="size-3.5" /> Agregar campo
            </button>
          </div>
          <ul className="divide-y divide-border">
            {fields.map((f, idx) => (
              <li key={idx} className="space-y-2 p-3">
                <div className="flex items-start gap-2">
                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      value={f.label}
                      onChange={(e) => {
                        const label = e.target.value
                        const isReserved = ["name", "email", "phone"].includes(f.key)
                        patch(idx, {
                          label,
                          key: isReserved
                            ? f.key
                            : slugKey(label, keys.filter((_, i) => i !== idx)),
                        })
                      }}
                      placeholder="Etiqueta del campo"
                      className={inputSm}
                    />
                    <select
                      value={f.type}
                      onChange={(e) =>
                        patch(idx, { type: e.target.value as FormFieldType })
                      }
                      className={inputSm}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronUp className="size-4" />
                    </button>
                    <button onClick={() => move(idx, 1)} disabled={idx === fields.length - 1} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronDown className="size-4" />
                    </button>
                    <button onClick={() => remove(idx)} className="p-1 text-muted-foreground hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {f.type !== "explanation" && (
                  <div className="flex flex-wrap items-center gap-3 pl-0.5">
                    <input
                      value={f.placeholder ?? ""}
                      onChange={(e) => patch(idx, { placeholder: e.target.value || undefined })}
                      placeholder="Placeholder (opcional)"
                      className={`${inputSm} flex-1`}
                    />
                    <label className="flex items-center gap-1.5 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={f.required ?? false}
                        onChange={(e) => patch(idx, { required: e.target.checked })}
                      />
                      Requerido
                    </label>
                    <code className="text-[11px] text-muted-foreground">{f.key}</code>
                  </div>
                )}
                {TYPES_WITH_OPTIONS.includes(f.type) && (
                  <OptionsEditor
                    options={f.options ?? []}
                    onChange={(options) => patch(idx, { options })}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        {initial ? (
          <button
            onClick={del}
            disabled={isPending}
            className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            Eliminar
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={isPending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-40"
          >
            {isPending ? "Guardando…" : initial ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string }[]
  onChange: (next: { value: string; label: string }[]) => void
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Opciones</span>
        <button
          onClick={() =>
            onChange([
              ...options,
              { value: `opcion_${options.length + 1}`, label: `Opción ${options.length + 1}` },
            ])
          }
          className="text-xs text-brand hover:underline"
        >
          + Opción
        </button>
      </div>
      <ul className="space-y-1.5">
        {options.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              value={o.label}
              onChange={(e) =>
                onChange(options.map((x, j) => (j === i ? { ...x, label: e.target.value, value: slugKey(e.target.value, options.filter((_, k) => k !== i).map((y) => y.value)) } : x)))
              }
              placeholder="Etiqueta"
              className={`${inputSm} flex-1`}
            />
            <button
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="p-1 text-muted-foreground hover:text-red-600"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── primitivas UI ────────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
const inputSm =
  "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"

function Labeled({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl border border-border bg-card p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
