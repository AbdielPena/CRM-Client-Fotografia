import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPublicFormResponse } from '@/server/services/form.service'
import { PublicFormView } from '@/components/public/public-form-view'
import type { FormSchema } from '@/lib/forms/types'

export const metadata: Metadata = { title: 'Formulario' }

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: { token: string }
  searchParams?: { error?: string; ok?: string }
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Formulario enviado</h1>
          <p className="text-sm text-gray-500">
            Gracias. Ya recibimos tus respuestas
            {response.completed_at
              ? ` el ${new Date(response.completed_at).toLocaleDateString('es', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}`
              : ''}
            .
          </p>
        </div>
      </div>
    )
  }

  // Terminal: expired (estado real o por expires_at)
  const expired =
    response.status === 'expired' ||
    (response.expires_at && new Date() > new Date(response.expires_at))
  if (expired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Enlace expirado</h1>
          <p className="text-sm text-gray-500">
            Este formulario ya no está disponible. Contacta a tu fotógrafo para que te envíe uno nuevo.
          </p>
        </div>
      </div>
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
    />
  )
}
