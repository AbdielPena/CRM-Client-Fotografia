"use client"

import { useState, useMemo } from "react"
import { Share2, Copy, Check, Mail, X } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Botón para compartir el link público de registro del studio.
 *
 * Modal con:
 *   - URL del link (copiable)
 *   - "Abrir en pestaña nueva" para vista previa
 *   - "Enviar por email" → mailto: pre-poblado
 */
export function ShareRegisterLinkButton({
  studioSlug,
}: {
  studioSlug: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const url = useMemo(() => {
    if (typeof window === "undefined") return `/r/${studioSlug}`
    return `${window.location.origin}/r/${studioSlug}`
  }, [studioSlug])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  const mailto = useMemo(() => {
    const subject = encodeURIComponent("Regístrate como cliente")
    const body = encodeURIComponent(
      `Hola,\n\nMe gustaría agregarte como cliente. Por favor llena este formulario rápido:\n\n${url}\n\nGracias,\n`,
    )
    return `mailto:?subject=${subject}&body=${body}`
  }, [url])

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        leftIcon={<Share2 className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        Compartir link
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card rounded-2xl border border-zinc-200 shadow-xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  Link público de registro
                </h2>
                <p className="text-sm text-zinc-500 mt-1">
                  Compártelo con clientes para que se registren sin necesidad
                  de cuenta. No requiere paquete — los datos llegan a tu lista
                  de clientes y puedes asignar paquete después.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 hover:bg-zinc-100 rounded-md text-zinc-500"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono bg-zinc-50"
              />
              <button
                onClick={copy}
                className="px-3 py-2 rounded-md border border-zinc-300 hover:bg-zinc-50 text-sm flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-md border border-zinc-300 hover:bg-zinc-50 text-sm"
              >
                Vista previa
              </a>
              <a
                href={mailto}
                className="px-3 py-2 rounded-md bg-zinc-900 text-white text-sm flex items-center gap-1.5 hover:bg-zinc-800"
              >
                <Mail className="h-3.5 w-3.5" />
                Enviar por email
              </a>
            </div>

            <div className="mt-5 pt-4 border-t border-zinc-100">
              <p className="text-xs text-zinc-500">
                <strong>Tip:</strong> después de que un cliente se registre,
                puedes enviarle el link de un paquete específico desde
                <span className="font-medium"> Paquetes → ⋯ → Compartir link</span>{" "}
                para que reserve.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
