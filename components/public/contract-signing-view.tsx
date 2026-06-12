"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { FileText, CheckCircle, Loader2, Pen, Check } from "lucide-react"

import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/public/signature-pad"
import { sanitizeHtml } from "@/lib/utils/sanitize-html"

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
    /** Banner de cabecera configurable por estudio. Si no hay, se usa un
     *  degradado de marca con el logo. */
    studioBannerUrl?: string
  }
}

export function ContractSigningView({
  token,
  contract,
  returnTo,
}: ContractSigningViewProps & { returnTo?: string }) {
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
        // Si venimos del wizard de booking, volver al siguiente paso (pago).
        // Pequeño delay para que el cliente vea la confirmación de firma.
        if (returnTo) {
          setTimeout(() => {
            window.location.href = returnTo
          }, 1200)
        }
      } catch {
        setError("Error de conexión. Por favor intentá nuevamente.")
      }
    })
  }

  if (signed) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
        <div className="bg-luxe-radial pointer-events-none absolute inset-0" />
        <div className="lx-card animate-fade-in-up relative w-full max-w-md p-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-white">
            <CheckCircle className="h-7 w-7" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            ¡Contrato firmado!
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Gracias, <strong className="text-foreground">{signerName}</strong>. Tu
            firma quedó guardada dentro del contrato.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Te enviamos una copia por email. Puedes cerrar esta página.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Banner hero — foto configurable del estudio o degradado de marca con logo */}
      <div className="relative h-48 w-full overflow-hidden sm:h-60">
        {contract.studioBannerUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={contract.studioBannerUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-black/30" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink-soft to-gold-800">
            <div className="bg-luxe-radial pointer-events-none absolute inset-0 opacity-50" />
          </div>
        )}
        <div className="relative flex h-full flex-col items-center justify-center gap-2.5 px-4 pb-6 text-center">
          {contract.studioLogoUrl ? (
            <span className="inline-flex items-center justify-center rounded-2xl bg-black/35 px-5 py-3 backdrop-blur-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={contract.studioLogoUrl}
                alt={contract.studioName}
                className="h-9 w-auto max-w-[200px] object-contain"
              />
            </span>
          ) : (
            <span className="font-serif text-2xl font-semibold text-white drop-shadow">
              {contract.studioName}
            </span>
          )}
          <span className="lx-overline text-white/75">
            Contrato · Firma digital segura
          </span>
        </div>
      </div>

      <div className="mx-auto -mt-12 max-w-3xl space-y-5 px-4 pb-8">
        {/* Header info */}
        <div className="lx-card animate-fade-in-up p-6">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft text-gold-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-semibold text-foreground">
                {contract.title}
              </h1>
              <p className="text-sm text-muted-foreground">
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
          <p className="text-sm text-muted-foreground">
            Hola <strong className="text-foreground">{contract.clientName}</strong>,
            lee el contrato a continuación y firma al final para confirmar tu
            acuerdo.
          </p>
        </div>

        {/* Body — HTML ya tiene placeholders y firma del studio renderizados */}
        <div className="lx-card p-8">
          <div
            className="contract-body prose prose-sm max-w-none text-foreground/90 dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(contract.bodyHtml) }}
          />
        </div>

        {/* Signature block */}
        <div className="lx-card p-6">
          <h2 className="font-serif text-lg font-semibold text-foreground">
            Firma con tu dedo o mouse
          </h2>

          <div className="mt-4">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Nombre completo *
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="sf-input-focus w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground focus:outline-none"
              placeholder="Como aparece en tu documento"
            />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Tu firma *
            </label>
            <div className="overflow-hidden rounded-xl border border-gold-300/60 bg-cream-50">
              <SignaturePad ref={padRef} onChange={setEmptySignature} />
            </div>
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
                className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
                  agreed
                    ? "border-gold-600 bg-gradient-to-br from-gold-400 to-gold-600"
                    : "border-border-strong"
                }`}
              >
                {agreed && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </div>
            </div>
            <span className="text-sm text-foreground/90">
              He leído y acepto los términos de este contrato. Entiendo que mi
              firma electrónica tiene la misma validez legal que una firma física.
            </span>
          </label>

          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            onClick={handleSign}
            disabled={!agreed || !signerName.trim() || emptySignature || isPending}
            className="lx-btn-gold mt-5 w-full disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pen className="h-4 w-4" />
            )}
            {isPending ? "Firmando…" : "Confirmar y firmar"}
          </button>

          <p className="mt-2.5 text-center text-[11px] text-muted-foreground">
            Tu firma incluirá la fecha, hora e IP como registro legal.
          </p>
        </div>
      </div>
    </div>
  )
}
