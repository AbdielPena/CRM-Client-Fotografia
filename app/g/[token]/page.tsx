import type { Metadata } from "next"

export const metadata: Metadata = { title: "Galería no disponible" }

export default function ClientGalleryPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M4.93 4.93a10 10 0 0114.14 14.14A10 10 0 014.93 4.93z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Galerías en mantenimiento</h1>
        <p className="text-sm text-gray-500">
          Esta función está temporalmente deshabilitada mientras migramos la
          infraestructura. Contacta a tu fotógrafo para recibir tus fotos.
        </p>
      </div>
    </div>
  )
}
