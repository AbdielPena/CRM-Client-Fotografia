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
      <div className="text-center py-6">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-zinc-900">
          {result.created ? "¡Registro completado!" : "Ya estás registrado"}
        </h2>
        <p className="text-sm text-zinc-600 mt-2">
          {result.created
            ? `Hemos enviado un correo de confirmación. ${result.studioName} se pondrá en contacto contigo pronto.`
            : `Ya tenemos tus datos. Si tienes preguntas, contáctanos.`}
        </p>
        {contactEmail ? (
          <p className="text-xs text-zinc-500 mt-4">
            ¿Dudas?{" "}
            <a
              className="text-zinc-900 underline"
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
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>{generalError}</p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-zinc-900 text-white rounded-md py-2.5 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition"
      >
        {isPending ? "Enviando…" : `Registrarme con ${studioName}`}
      </button>

      <p className="text-[11px] text-zinc-500 text-center">
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
      <label className="block text-sm font-medium text-zinc-800 mb-1">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <Component
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
      />
      {errors && errors.length > 0 ? (
        <p className="text-xs text-red-600 mt-1">{errors[0]}</p>
      ) : null}
    </div>
  )
}
