'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import type { FormSchema, FormField } from '@/lib/forms/types'

interface PublicFormViewProps {
  token: string
  schema: FormSchema
  initialData: Record<string, unknown>
  template: { name: string; description: string | null }
  studio: { id: string; name: string; primary_color: string | null } | null
  errorFromQuery?: string
  /** Si viene del wizard de booking, al enviar regresa acá (siguiente paso). */
  returnTo?: string
}

export function PublicFormView({
  token,
  schema,
  initialData,
  template,
  studio,
  errorFromQuery,
  returnTo,
}: PublicFormViewProps) {
  const router = useRouter()
  const [data, setData] = useState<Record<string, unknown>>(initialData ?? {})
  const [errors, setErrors] = useState<Record<string, string>>(
    errorFromQuery ? { _form: errorFromQuery } : {},
  )
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)

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
        if (returnTo) {
          window.location.href = returnTo
          return
        }
        router.refresh()
      } catch {
        setErrors({ _form: 'Error de conexión' })
      }
    })
  }

  if (submitted) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
        <div className="bg-luxe-radial pointer-events-none absolute inset-0" />
        <div className="lx-card animate-fade-in-up relative w-full max-w-md p-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-white">
            <Check className="h-7 w-7" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            ¡Formulario enviado!
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gracias. Tu fotógrafo recibirá tus respuestas.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="lx-glass sticky top-0 z-20">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3.5">
          <span className="font-serif text-base font-semibold text-foreground">
            {studio?.name ?? 'Studio'}
          </span>
          <span className="lx-overline">Formulario</span>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div className="lx-card animate-fade-in-up p-7">
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {template.name}
          </h1>
          {template.description && (
            <p className="mt-1.5 text-[15px] text-muted-foreground">
              {template.description}
            </p>
          )}
          {schema.description && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {schema.description}
            </p>
          )}
        </div>

        <div className="lx-card space-y-5 p-7">
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
          <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errors._form}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleSaveProgress}
            disabled={isPending}
            className="lx-btn-outline flex-1 disabled:opacity-40"
          >
            Guardar avance
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="lx-btn-gold flex-1 disabled:opacity-40"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar formulario'}
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
    'sf-input-focus w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground focus:outline-none'

  // Bloque de explicación: solo texto descriptivo, sin input.
  if (field.type === 'explanation') {
    return (
      <div className="rounded-xl bg-brand-soft/40 px-4 py-3">
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-foreground/85">
          {field.label}
        </p>
      </div>
    )
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      {field.help && <p className="mb-2 text-xs text-muted-foreground">{field.help}</p>}
      {renderInput(field, value, onChange, common)}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
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
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
            >
              <input
                type="radio"
                name={field.key}
                checked={str === o.value}
                onChange={() => onChange(o.value)}
                className="accent-gold-600"
              />
              {o.label}
            </label>
          ))}
        </div>
      )
    case 'checkbox':
      return (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 accent-gold-600"
          />
          {field.placeholder ?? 'Acepto'}
        </label>
      )
    case 'file':
      return (
        <p className="text-xs text-muted-foreground">
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
