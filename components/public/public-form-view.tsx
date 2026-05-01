'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { FormSchema, FormField } from '@/lib/forms/types'

interface PublicFormViewProps {
  token: string
  schema: FormSchema
  initialData: Record<string, unknown>
  template: { name: string; description: string | null }
  studio: { id: string; name: string; primary_color: string | null } | null
  errorFromQuery?: string
}

export function PublicFormView({
  token,
  schema,
  initialData,
  template,
  studio,
  errorFromQuery,
}: PublicFormViewProps) {
  const router = useRouter()
  const [data, setData] = useState<Record<string, unknown>>(initialData ?? {})
  const [errors, setErrors] = useState<Record<string, string>>(
    errorFromQuery ? { _form: errorFromQuery } : {},
  )
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)

  const primary = studio?.primary_color ?? '#111827'

  function setField(key: string, value: unknown) {
    setData((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  function isVisible(field: FormField): boolean {
    if (!field.visibleIf) return true
    const src = String(data[field.visibleIf.key] ?? '')
    return src === field.visibleIf.equals
  }

  async function handleSaveProgress() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/forms/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, data }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setErrors({ _form: body.error ?? 'No pudimos guardar el avance' })
        } else {
          setErrors({ _form: 'Avance guardado' })
        }
      } catch {
        setErrors({ _form: 'Error de conexión' })
      }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const res = await fetch('/api/forms/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, data }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          if (body.fieldErrors) {
            setErrors(body.fieldErrors)
          } else {
            setErrors({ _form: body.error ?? 'No pudimos enviar el formulario' })
          }
          return
        }
        setSubmitted(true)
        router.refresh()
      } catch {
        setErrors({ _form: 'Error de conexión' })
      }
    })
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">¡Formulario enviado!</h1>
          <p className="text-sm text-gray-500">Gracias. Tu fotógrafo recibirá tus respuestas.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">
            {studio?.name ?? 'Studio'}
          </span>
          <span className="text-xs text-gray-400">Formulario</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h1 className="text-lg font-bold text-gray-900">{template.name}</h1>
          {template.description && (
            <p className="text-sm text-gray-500 mt-1">{template.description}</p>
          )}
          {schema.description && (
            <p className="text-sm text-gray-600 mt-3">{schema.description}</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {schema.fields.filter(isVisible).map((field) => (
            <FormFieldRenderer
              key={field.key}
              field={field}
              value={data[field.key]}
              error={errors[field.key]}
              onChange={(v) => setField(field.key, v)}
            />
          ))}
        </div>

        {errors._form && (
          <p className="text-sm text-center px-4 py-3 bg-red-50 text-red-700 rounded-lg">
            {errors._form}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSaveProgress}
            disabled={isPending}
            className="flex-1 py-3 border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Guardar avance
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 py-3 rounded-xl font-medium text-white disabled:opacity-40"
            style={{ background: primary }}
          >
            {isPending ? 'Enviando…' : 'Enviar formulario'}
          </button>
        </div>
      </form>
    </div>
  )
}

function FormFieldRenderer({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField
  value: unknown
  error?: string
  onChange: (v: unknown) => void
}) {
  const common =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400'

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      {field.help && <p className="text-xs text-gray-500 mb-2">{field.help}</p>}
      {renderInput(field, value, onChange, common)}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

function renderInput(
  field: FormField,
  value: unknown,
  onChange: (v: unknown) => void,
  cls: string,
) {
  const str = typeof value === 'string' ? value : value == null ? '' : String(value)

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={str}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className={cls}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          value={str}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          className={cls}
        />
      )
    case 'date':
      return (
        <input
          type="date"
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )
    case 'email':
      return (
        <input
          type="email"
          value={str}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? 'correo@ejemplo.com'}
          className={cls}
        />
      )
    case 'tel':
      return (
        <input
          type="tel"
          value={str}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? '+1 809 …'}
          className={cls}
        />
      )
    case 'select':
      return (
        <select
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        >
          <option value="">Selecciona…</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case 'radio':
      return (
        <div className="space-y-2">
          {(field.options ?? []).map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
            >
              <input
                type="radio"
                name={field.key}
                checked={str === o.value}
                onChange={() => onChange(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      )
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.placeholder ?? 'Acepto'}
        </label>
      )
    case 'file':
      return (
        <p className="text-xs text-gray-500">
          (Subida de archivos aún no disponible — próximamente)
        </p>
      )
    default:
      return (
        <input
          type="text"
          value={str}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={cls}
        />
      )
  }
}
