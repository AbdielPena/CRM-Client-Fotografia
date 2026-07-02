import { redirect } from "next/navigation"
import { Crown, CheckCircle2 } from "lucide-react"

import {
  getQuinceNameContext,
  submitQuinceName,
} from "@/server/services/quince-name.service"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// Server action: guarda el nombre (valida el token dentro del service).
async function saveAction(formData: FormData) {
  "use server"
  const token = String(formData.get("token") ?? "")
  const name = String(formData.get("name") ?? "")
  const res = await submitQuinceName(token, name)
  if (!res.ok) {
    redirect(`/q/${token}?error=${encodeURIComponent(res.error ?? "Error")}`)
  }
  redirect(`/q/${token}?ok=1`)
}

export default async function QuinceNamePage({
  params,
  searchParams,
}: {
  params: { token: string }
  searchParams?: { ok?: string; error?: string }
}) {
  const ctx = await getQuinceNameContext(params.token)

  const accent = ctx?.accent || "#b4884d"
  const done = searchParams?.ok === "1"
  const errorMsg = searchParams?.error ? decodeURIComponent(searchParams.error) : null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-md">
        {/* Header estudio */}
        <div className="flex flex-col items-center text-center mb-6">
          {ctx?.studioLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ctx.studioLogo}
              alt={ctx.studioName}
              className="h-12 w-12 rounded-full object-cover mb-2"
            />
          ) : (
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold mb-2"
              style={{ backgroundColor: accent }}
            >
              {(ctx?.studioName ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <p className="text-sm font-semibold text-gray-900">
            {ctx?.studioName ?? "Estudio"}
          </p>
        </div>

        {!ctx ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
            <h1 className="text-lg font-bold text-gray-900 mb-2">Enlace no válido</h1>
            <p className="text-sm text-gray-600">
              Este enlace no es válido o ya venció. Pídele al estudio uno nuevo.
            </p>
          </div>
        ) : done ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: `${accent}1a`, color: accent }}
            >
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 mb-1">¡Listo, gracias! 💛</h1>
            <p className="text-sm text-gray-600">
              Guardamos el nombre de la quinceañera. Ya puedes cerrar esta página.
            </p>
          </div>
        ) : (
          <form
            action={saveAction}
            className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm"
          >
            <input type="hidden" name="token" value={params.token} />

            <div className="flex flex-col items-center text-center mb-5">
              <div
                className="mb-3 flex h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: `${accent}1a`, color: accent }}
              >
                <Crown className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">
                ¿Cómo se llama la quinceañera?
              </h1>
              <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                Para preparar <strong>{ctx.sessionName}</strong> necesitamos el
                nombre de la quinceañera.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                {errorMsg}
              </div>
            )}

            <label className="block">
              <span className="text-xs font-medium text-gray-700 mb-1.5 block">
                Nombre de la quinceañera <span className="text-red-500">*</span>
              </span>
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                autoFocus
                defaultValue={ctx.currentName ?? ""}
                placeholder="Ej: Elianny Martínez"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1"
              />
            </label>

            <button
              type="submit"
              className="mt-5 w-full py-3 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              {ctx.currentName ? "Actualizar nombre" : "Guardar nombre"}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">Powered by PixelOS</p>
      </div>
    </div>
  )
}
