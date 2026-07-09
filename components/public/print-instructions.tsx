"use client"

import { Info } from "lucide-react"

import {
  PRINT_INSTRUCTIONS,
  buildPrintHints,
  hasSelectableCategories,
  type PrintHintCategory,
} from "@/lib/print/instructions"

/**
 * Guía para el cliente de CÓMO elegir sus impresiones. Se adapta a lo que trae
 * el plan (marcos / portada / impresiones manuales o automáticas). Colapsable,
 * abierta por defecto.
 */
export function PrintInstructions({
  categories,
}: {
  categories: PrintHintCategory[]
}) {
  if (categories.length === 0) return null
  const hints = buildPrintHints(categories)
  const selectable = hasSelectableCategories(categories)

  return (
    <details
      open
      className="mb-5 rounded-xl border border-gold-200/70 bg-white/70 dark:border-gold-500/25 dark:bg-zinc-900/40"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-semibold text-zinc-800 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
        <Info className="h-4 w-4 text-gold-600" />
        Cómo elegir tus impresiones
      </summary>
      <div className="space-y-3 px-4 pb-4 pt-0 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        <p>{PRINT_INSTRUCTIONS.intro}</p>

        {selectable && (
          <ol className="ml-4 list-decimal space-y-1.5 marker:font-semibold marker:text-gold-600">
            {PRINT_INSTRUCTIONS.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        )}

        {hints.length > 0 && (
          <ul className="ml-1 space-y-1.5">
            {hints.map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gold-500" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        )}

        {selectable ? (
          <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">
            {PRINT_INSTRUCTIONS.submitHint}
          </p>
        ) : (
          <p className="font-medium text-emerald-700 dark:text-emerald-300">
            No necesitas elegir nada — ya te quedan listas. 💛
          </p>
        )}
      </div>
    </details>
  )
}
