"use client"

import { Printer, ArrowLeft } from "lucide-react"

export function ContractPrintActions() {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 shadow-sm">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver
      </button>
      <div className="flex items-center gap-2">
        <p className="hidden text-[11.5px] text-zinc-500 sm:block">
          Tip: usá <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px]">Ctrl+P</kbd>
          {" "}→ Guardar como PDF
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
        >
          <Printer className="h-3.5 w-3.5" />
          Imprimir / PDF
        </button>
      </div>
    </div>
  )
}
