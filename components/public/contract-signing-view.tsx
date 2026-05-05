"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { FileText, CheckCircle, Loader2, Pen } from "lucide-react"

import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/public/signature-pad"

interface ContractSigningViewProps {
  token: string
  contract: {
    id: string
    title: string
    /** HTML del contrato con placeholders ya renderizados (server-side). */
    bodyHtml: string
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
  const [emptySignature, setEmptySignature] = useState(true)
  const [signed, setSigned] = useState(false)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const padRef = useRef<SignaturePadHandle | null>(null)

  // Marcar visto al cargar (best-effort)
  useEffect(() => {
    void fetch(`/api/contracts/sign?token=${encodeURIComponent(token)}`, {
      method: "PUT",
    }).catch(() => {})
  }, [token])

  const handleSign = () => {
    setError("")
    if (!agreed) {
      setError("Debes aceptar los términos antes de firmar")
      return
    }
    if (!signerName.trim()) {
      setError("Escribe tu nombre completo")
      return
    }
    const dataUrl = padRef.current?.getDataUrl() ?? null
    if (!dataUrl) {
      setError("Firma en el cuadro antes de confirmar")
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/contracts/sign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            signerName: signerName.trim(),
            signerEmail: contract.clientEmail ?? undefined,
            signatureImageDataUrl: dataUrl,
          }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null
          setError(data?.error ?? "Error al firmar el contrato")
          return
        }
        setSigned(true)
      } catch {
        setError("Error de conexión. Por favor intentá nuevamente.")
      }
    })
  }

  if (signed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
            <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
            ¡Contrato firmado!
          </h1>
          <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
            Gracias, <strong>{signerName}</strong>. Tu firma se guardó dentro del
            contrato.
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Te enviamos una copia por email. Podés cerrar esta página.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            {contract.studioLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contract.studioLogoUrl}
                alt={contract.studioName}
                className="h-8 rounded"
              />
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                {contract.studioName.charAt(0)}
              </div>
            )}
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {contract.studioName}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400">Firma digital segura</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {/* Header info */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
              <FileText className="h-5 w-5 text-zinc-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {contract.title}
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Proyecto: {contract.projectName}
                {contract.eventDate &&
                  ` · ${new Date(contract.eventDate).toLocaleDateString("es", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}`}
              </p>
            </div>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Hola <strong>{contract.clientName}</strong>, leé el contrato a
            continuación y firmá al final para confirmar tu acuerdo.
          </p>
        </div>

        {/* Body — HTML ya tiene placeholders y firma del studio renderizados */}
        <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <div
            className="contract-body prose prose-sm max-w-none text-zinc-800 dark:prose-invert dark:text-zinc-200"
            dangerouslySetInnerHTML={{ __html: contract.bodyHtml }}
          />
        </div>

        {/* Signature block */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Firmá con tu dedo o mouse
          </h2>

          <div className="mt-3">
            <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Nombre completo *
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="Como aparece en tu documento"
            />
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Tu firma *
            </label>
            <SignaturePad ref={padRef} onChange={setEmptySignature} />
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                  agreed
                    ? "border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {agreed && (
                  <svg
                    className="h-3 w-3 text-white dark:text-zinc-900"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              He leído y acepto los términos de este contrato. Entiendo que mi
              firma electrónica tiene la misma validez legal que una firma física.
            </span>
          </label>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={handleSign}
            disabled={!agreed || !signerName.trim() || emptySignature || isPending}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pen className="h-4 w-4" />
            )}
            {isPending ? "Firmando…" : "Confirmar y firmar"}
          </button>

          <p className="mt-2 text-center text-[11px] text-zinc-400">
            Tu firma incluirá la fecha, hora e IP como registro legal.
          </p>
        </div>
      </div>
    </div>
  )
}
