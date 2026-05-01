import Link from "next/link"

export default function PackageNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-5">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-2">
          404
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Este paquete ya no está disponible
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Es posible que el enlace haya cambiado o que el fotógrafo haya
          pausado este paquete temporalmente.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
