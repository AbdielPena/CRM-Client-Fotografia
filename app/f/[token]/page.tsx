import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Check, X } from 'lucide-react'
import { getPublicFormResponse } from '@/server/services/form.service'
import { PublicFormView } from '@/components/public/public-form-view'
import type { FormSchema } from '@/lib/forms/types'

export const metadata: Metadata = { title: 'Formulario' }

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: { token: string }
  searchParams?: { error?: string; ok?: string; return?: string }
}) {
  const result = await getPublicFormResponse(params.token)
  if (!result) notFound()

  const { response, template, studio } = result
  const schema = (response.schema_snapshot as unknown as FormSchema) ?? {
    version: 1,
    fields: [],
  }

  // Terminal: completed
  if (response.status === 'completed') {
    return (
      <Terminal
        tone="success"
        icon={<Check className="h-7 w-7" />}
        title="Formulario enviado"
        text={`Gracias. Ya recibimos tus respuestas${
          response.completed_at
            ? ` el ${new Date(response.completed_at).toLocaleDateString('es', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}`
            : ''
        }.`}
      />
    )
  }

  // Terminal: expired
  const expired =
    response.status === 'expired' ||
    (response.expires_at && new Date() > new Date(response.expires_at))
  if (expired) {
    return (
      <Terminal
        tone="danger"
        icon={<X className="h-7 w-7" />}
        title="Enlace expirado"
        text="Este formulario ya no está disponible. Contacta a tu fotógrafo para que te envíe uno nuevo."
      />
    )
  }

  return (
    <PublicFormView
      token={params.token}
      schema={schema}
      initialData={response.data}
      template={template}
      studio={studio}
      errorFromQuery={searchParams?.error}
      returnTo={
        searchParams?.return?.startsWith("/b/") ? searchParams.return : undefined
      }
    />
  )
}

function Terminal({
  tone,
  icon,
  title,
  text,
}: {
  tone: "success" | "danger"
  icon: React.ReactNode
  title: string
  text: string
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="bg-luxe-radial pointer-events-none absolute inset-0" />
      <div className="lx-card animate-fade-in-up relative w-full max-w-md p-10 text-center">
        <div
          className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full text-white ${
            tone === "success"
              ? "bg-gradient-to-br from-gold-400 to-gold-600"
              : "bg-gradient-to-br from-red-400 to-red-600"
          }`}
        >
          {icon}
        </div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          {title}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {text}
        </p>
      </div>
    </div>
  )
}
