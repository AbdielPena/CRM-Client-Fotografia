"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, AlertCircle } from "lucide-react"

import { registerPublicClient, type RegisterResult } from "./actions"

export function PublicRegisterForm({
  studioSlug,
  studioName,
  contactEmail,
}: {
  studioSlug: string
  studioName: string
  contactEmail: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<RegisterResult | null>(null)

  function onSubmit(formData: FormData) {
    formData.set("studioSlug", studioSlug)
    startTransition(async () => {
      const r = await registerPublicClient(formData)
      setResult(r)
    })
  }

  if (result?.ok) {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-white">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="font-serif text-xl font-semibold text-foreground">
          {result.created ? `¡Gracias!` : "Ya estás registrado"}
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {result.created
            ? `Hemos enviado un correo de confirmación. ${result.studioName} se pondrá en contacto contigo pronto.`
            : `Ya tenemos tus datos. Si tienes preguntas, contáctanos.`}
        </p>
        {contactEmail ? (
          <p className="mt-4 text-xs text-muted-foreground">
            ¿Dudas?{" "}
            <a
              className="font-medium text-gold-700 hover:underline"
              href={`mailto:${contactEmail}`}
            >
              {contactEmail}
            </a>
          </p>
        ) : null}
      </div>
    )
  }

  const fieldErrors = (result && !result.ok ? result.fields : null) ?? {}
  const generalError = result && !result.ok ? result.error : null

  return (
    <form action={onSubmit} className="space-y-4">
      <Field
        label="Nombre completo"
        name="name"
        required
        autoComplete="name"
        placeholder="ej. Andrea Pérez"
        errors={fieldErrors["name"]}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="andrea@email.com"
        errors={fieldErrors["email"]}
      />
      <Field
        label="Teléfono (opcional)"
        name="phone"
        type="tel"
        autoComplete="tel"
        placeholder="+1 809 ..."
        errors={fieldErrors["phone"]}
      />
      <Field
        label="¿Algo que quieras contarnos?"
        name="notes"
        as="textarea"
        rows={3}
        placeholder="ej. Necesito sesión para mi boda en abril"
        errors={fieldErrors["notes"]}
      />

      {generalError ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{generalError}</p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="lx-btn-gold w-full disabled:opacity-50"
      >
        {isPending ? "Enviando…" : `Continuar con ${studioName}`}
      </button>

      <p className="text-center text-[11px] text-muted-foreground">
        Al registrarte, aceptas que {studioName} te contacte por email.
      </p>
    </form>
  )
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  placeholder,
  as,
  rows,
  errors,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  autoComplete?: string
  placeholder?: string
  as?: "input" | "textarea"
  rows?: number
  errors?: string[]
}) {
  const Component = as === "textarea" ? "textarea" : "input"
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <Component
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        rows={rows}
        className="sf-input-focus w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground focus:outline-none"
      />
      {errors && errors.length > 0 ? (
        <p className="mt-1 text-xs text-red-600">{errors[0]}</p>
      ) : null}
    </div>
  )
}
