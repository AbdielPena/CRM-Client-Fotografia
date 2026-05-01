"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileText, CheckCircle } from "lucide-react"

interface ContractSigningViewProps {
  token: string
  contract: {
    id: string
    title: string
    body: string
    status: string
    expiresAt?: string
    clientName: string
    clientEmail?: string
    projectName: string
    eventDate?: string
    studioName: string
    studioLogoUrl?: string
  }
}

export function ContractSigningView({ token, contract }: ContractSigningViewProps) {
  const [agreed, setAgreed] = useState(false)
  const [signerName, setSignerName] = useState(contract.clientName)
  const [signed, setSigned] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleSign = () => {
    if (!agreed || !signerName.trim()) return

    startTransition(async () => {
      try {
        const res = await fetch(`/api/contracts/sign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            signerName,
            signerEmail: contract.clientEmail ?? undefined,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          setError(data.error ?? "Error al firmar el contrato")
          return
        }

        setSigned(true)
      } catch {
        setError("Error de conexión. Por favor intenta nuevamente.")
      }
    })
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">¡Contrato firmado!</h1>
          <p className="text-sm text-gray-500 mb-4">
            Gracias, <strong>{signerName}</strong>. El contrato ha sido firmado exitosamente.
          </p>
          <p className="text-sm text-gray-500">
            Recibirás una copia por email. Puedes cerrar esta página.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {contract.studioLogoUrl ? (
              <img src={contract.studioLogoUrl} alt={contract.studioName} className="h-8" />
            ) : (
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {contract.studioName.charAt(0)}
                </span>
              </div>
            )}
            <span className="text-sm font-semibold text-gray-900">{contract.studioName}</span>
          </div>
          <span className="text-xs text-gray-400">Firma digital segura</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Contract info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{contract.title}</h1>
              <p className="text-sm text-gray-500">
                Proyecto: {contract.projectName}
                {contract.eventDate && ` · ${new Date(contract.eventDate).toLocaleDateString("es")}`}
              </p>
            </div>
          </div>

          <p className="text-sm text-gray-600">
            Hola <strong>{contract.clientName}</strong>, por favor lee el siguiente contrato con
            atención y firma al final para confirmar tu acuerdo.
          </p>
        </div>

        {/* Contract body */}
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
            {contract.body}
          </div>
        </div>

        {/* Signature block */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Firma del contrato</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tu nombre completo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              placeholder="Escribe tu nombre completo"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  agreed ? "bg-gray-900 border-gray-900" : "border-gray-300"
                }`}
              >
                {agreed && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-gray-700">
              He leído y acepto los términos de este contrato. Entiendo que al firmar
              electrónicamente, este documento tiene la misma validez legal que una firma física.
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            onClick={handleSign}
            disabled={!agreed || !signerName.trim() || isPending}
            className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? "Firmando..." : "✍️ Firmar contrato"}
          </button>

          <p className="text-xs text-center text-gray-400">
            Tu firma incluirá la fecha, hora y dirección IP como registro legal.
          </p>
        </div>
      </div>
    </div>
  )
}
