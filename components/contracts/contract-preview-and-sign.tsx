"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Eye, FileCode2, Pen, Loader2, X, Check, Printer } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/public/signature-pad"
import { sanitizeHtml } from "@/lib/utils/sanitize-html"

type Mode = "preview" | "raw"

export function ContractPreviewAndSign({
  contractId,
  rawBody,
  studioHasSignature,
  studioAlreadySigned,
}: {
  contractId: string
  rawBody: string
  studioHasSignature: boolean
  studioAlreadySigned: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("preview")
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [signOpen, setSignOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const padRef = useRef<SignaturePadHandle | null>(null)
  const [signedName, setSignedName] = useState("")
  const [emptySig, setEmptySig] = useState(true)

  useEffect(() => {
    if (mode !== "preview" || previewHtml) return
    setLoadingPreview(true)
    fetch(`/api/contracts/${contractId}/preview`)
      .then((r) => r.json())
      .then((d: { html?: string; error?: string }) => {
        if (d.error) {
          toast.error(d.error)
          return
        }
        setPreviewHtml(d.html ?? "")
      })
      .catch(() => toast.error("No se pudo generar la vista previa"))
      .finally(() => setLoadingPreview(false))
  }, [mode, previewHtml, contractId])

  const submitStudioSign = () => {
    let signatureImageDataUrl: string | undefined
    if (!studioHasSignature) {
      signatureImageDataUrl = padRef.current?.getDataUrl() ?? undefined
      if (!signatureImageDataUrl) {
        toast.error("Firmá en el cuadro o cargá una firma reusable en Settings")
        return
      }
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/contracts/${contractId}/studio-sign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signatureImageDataUrl,
            signedName: signedName.trim() || undefined,
          }),
        })
        const data = (await res.json()) as { ok?: boolean; error?: string }
        if (!res.ok || data.error) {
          toast.error(data.error ?? "No se pudo firmar")
          return
        }
        toast.success("Firmaste el contrato como estudio")
        setSignOpen(false)
        // Forzar refresh del preview
        setPreviewHtml(null)
        router.refresh()
      } catch {
        toast.error("Error de conexión")
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "preview"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            Vista previa
          </button>
          <button
            type="button"
            onClick={() => setMode("raw")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "raw"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileCode2 className="h-3.5 w-3.5" />
            Plantilla original
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/contract-print/${contractId}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir / PDF
          </Link>
          {!studioAlreadySigned && (
            <button
              type="button"
              onClick={() => setSignOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
            >
              <Pen className="h-3.5 w-3.5" />
              Firmar como estudio
            </button>
          )}
          {studioAlreadySigned && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Check className="h-3.5 w-3.5" />
              Estudio firmó
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="rounded-xl border border-border bg-card p-6">
        {mode === "preview" ? (
          loadingPreview ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generando vista previa con datos reales…
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none text-foreground dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }}
            />
          )
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-foreground">
            {rawBody}
          </pre>
        )}
      </div>

      {/* Modal firma studio */}
      {signOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setSignOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Firmar como estudio
                </h3>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Tu firma se inyecta en el espacio{" "}
                  <code className="text-[11px]">{`{{signature_studio}}`}</code> del
                  contrato.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSignOpen(false)}
                className="rounded-md p-1 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {studioHasSignature ? (
              <div className="rounded-lg bg-emerald-50 p-3 text-[12.5px] text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                Tenés firma reusable cargada en Settings. Se aplicará automáticamente.
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Nombre que firma
                  </label>
                  <input
                    value={signedName}
                    onChange={(e) => setSignedName(e.target.value)}
                    placeholder="Ej: Estudio o tu nombre"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Firma
                  </label>
                  <SignaturePad ref={padRef} onChange={setEmptySig} />
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSignOpen(false)}
                className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/80"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitStudioSign}
                disabled={
                  pending || (!studioHasSignature && (emptySig || !signedName.trim()))
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pen className="h-3.5 w-3.5" />}
                Confirmar firma
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
