"use client"

import { Printer } from "lucide-react"

import type { GalleryPrintState } from "@/server/services/print-selection.service"
import { PrintSelectionPanel } from "@/components/public/print-selection-panel"

type AssetLite = { id: string; thumbUrl: string | null }

type Studio = {
  name: string
  logoUrl: string | null
  primaryColor?: string | null
  hideBranding?: boolean
  footerHtml?: string | null
}

/**
 * Vista pública ENFOCADA para elegir impresiones (marcos / álbum / fotos),
 * separada de la galería completa. Es a donde apunta el link de WhatsApp
 * (`?impresiones=1`): el cliente entra directo a seleccionar, sin tener que
 * bajar por toda la entrega.
 */
export function PrintSelectionView({
  token,
  galleryName,
  assets,
  printState,
  clientEmail = null,
  studio,
}: {
  token: string
  galleryName: string
  assets: AssetLite[]
  printState: GalleryPrintState
  clientEmail?: string | null
  studio: Studio
}): JSX.Element {
  const accent = studio.primaryColor || "#b89968"

  return (
    <div className="min-h-screen bg-[#fbf9f6] text-[#1a1614]">
      {/* Header */}
      <header className="border-b border-black/5 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            {studio.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studio.logoUrl} alt={studio.name} className="h-8 w-auto object-contain" />
            )}
            <span className="text-sm font-medium text-black/60">{studio.name}</span>
          </div>
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: `${accent}1a`, color: accent }}
          >
            <Printer className="mr-1 inline h-3.5 w-3.5" />
            Impresiones
          </span>
        </div>
      </header>

      {/* Título */}
      <section className="mx-auto max-w-6xl px-5 pt-10 pb-2 text-center">
        <p
          className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em]"
          style={{ color: accent }}
        >
          Impresiones incluidas en tu plan
        </p>
        <h1 className="text-3xl font-light tracking-tight sm:text-4xl">{galleryName}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-black/55">
          Elige las fotos para tus marcos, portada de álbum e impresiones. Toca cada
          entregable y luego las fotos; al terminar, envía tu selección.
        </p>
      </section>

      {/* Panel de selección (reusa el mismo del flujo público) */}
      <PrintSelectionPanel
        token={token}
        assets={assets}
        initialState={printState}
        clientEmail={clientEmail}
        clientName={null}
      />

      {/* Footer */}
      <footer className="border-t border-black/5 py-6 text-center text-xs text-black/40">
        {studio.footerHtml ? (
          <div dangerouslySetInnerHTML={{ __html: studio.footerHtml }} />
        ) : (
          <span>{studio.name}</span>
        )}
        {!studio.hideBranding && (
          <p className="mt-1 text-[10px] text-black/30">Hecho con StudioFlow</p>
        )}
      </footer>
    </div>
  )
}
