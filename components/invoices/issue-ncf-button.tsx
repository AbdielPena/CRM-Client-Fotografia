"use client"

import { useState, useTransition } from "react"
import { Receipt, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { issueNcfForInvoiceAction } from "@/server/actions/fiscal-ncf.actions"
import { NCF_TYPE_LABELS, NCF_TYPES, type NcfType } from "@/lib/fiscal"
import { Button } from "@/components/ui/button"

export function IssueNcfButton({
  invoiceId,
  currentNcf,
  currentNcfType,
  defaultNcfType,
  hasClientRnc,
}: {
  invoiceId: string
  currentNcf?: string | null
  currentNcfType?: NcfType | null
  defaultNcfType?: NcfType | null
  /** Si el client tiene RNC/cédula registrado — afecta qué tipos son válidos */
  hasClientRnc?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [showPicker, setShowPicker] = useState(false)
  const [selectedType, setSelectedType] = useState<NcfType>(
    defaultNcfType ?? "B02",
  )

  // Si la invoice ya tiene NCF, render badge read-only
  if (currentNcf) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-mono font-semibold text-primary"
        title={
          currentNcfType
            ? `${NCF_TYPE_LABELS[currentNcfType]} — emitido DGII`
            : "NCF emitido DGII"
        }
      >
        <Receipt className="size-3" />
        {currentNcf}
      </span>
    )
  }

  const handleIssue = () => {
    startTransition(async () => {
      const result = await issueNcfForInvoiceAction({
        invoiceId,
        ncfType: selectedType,
      })
      if (result.ok) {
        toast.success(`NCF ${result.result.ncf} emitido`, {
          description: NCF_TYPE_LABELS[result.result.ncfType],
        })
        setShowPicker(false)
      } else {
        toast.error("No se pudo emitir NCF", {
          description: result.message,
          duration: 8000,
        })
      }
    })
  }

  if (!showPicker) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setShowPicker(true)}
        className="gap-1.5"
      >
        <Receipt className="size-3.5" />
        Emitir NCF
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-input bg-background p-2">
      <select
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value as NcfType)}
        disabled={isPending}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {NCF_TYPES.map((t) => {
          const requiresRnc = ["B01", "B03", "B14", "B15", "B16"].includes(t)
          const disabled = requiresRnc && hasClientRnc === false
          return (
            <option key={t} value={t} disabled={disabled}>
              {t} — {NCF_TYPE_LABELS[t]}
              {disabled ? " (requiere RNC)" : ""}
            </option>
          )
        })}
      </select>
      <Button
        type="button"
        size="sm"
        onClick={handleIssue}
        disabled={isPending}
        className="gap-1"
      >
        {isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <CheckCircle2 className="size-3" />
        )}
        Emitir
      </Button>
      <button
        type="button"
        onClick={() => setShowPicker(false)}
        disabled={isPending}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Cancelar
      </button>
      {hasClientRnc === false && (
        <div className="ml-2 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="size-3" />
          Cliente sin RNC
        </div>
      )}
    </div>
  )
}
