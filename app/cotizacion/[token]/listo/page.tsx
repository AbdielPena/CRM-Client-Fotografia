import type { Metadata } from "next"
import { CheckCircle2 } from "lucide-react"

export const metadata: Metadata = { title: "¡Listo!" }
export const dynamic = "force-dynamic"

/** Confirmación tras aceptar una cotización libre. El contrato sale por correo. */
export default function CotizacionListaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-5 py-16">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-600" />
        <h1 className="text-xl font-semibold text-gray-900">
          ¡Recibimos tus datos! 💛
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          En un momento te llega por correo el <strong>contrato para firmar</strong>.
          Al firmarlo queda apartada tu fecha.
        </p>
        <p className="mt-4 text-xs text-gray-400">
          Si no lo ves en unos minutos, revisa tu carpeta de spam o escríbenos.
        </p>
      </div>
    </div>
  )
}
