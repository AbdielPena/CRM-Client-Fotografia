"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Receipt, Loader2, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { generateExtrasInvoiceAction } from "@/server/actions/gallery.actions"

export function GalleryExtrasInvoiceButton({
  galleryId,
  extras,
  extraTotal,
  currency,
}: {
  galleryId: string
  extras: number
  extraTotal: number
  currency: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [invoiceId, setInvoiceId] = useState<string | null>(null)

  const money = new Intl.NumberFormat("es", { style: "currency", currency }).format(extraTotal)

  function gen() {
    start(async () => {
      const r = (await generateExtrasInvoiceAction(galleryId)) as {
        invoiceId?: string
        error?: string
        already?: boolean
      }
      if (r.error) {
        toast.error(r.error)
        return
      }
      if (r.invoiceId) {
        setInvoiceId(r.invoiceId)
        toast.success(r.already ? "Ya existía una factura de extras" : "Factura de extras creada")
        router.push(`/invoices/${r.invoiceId}`)
      }
    })
  }

  if (invoiceId) {
    return (
      <a
        href={`/invoices/${invoiceId}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:border-border-strong"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Ver factura de extras
      </a>
    )
  }

  return (
    <button
      type="button"
      onClick={gen}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Receipt className="h-3.5 w-3.5" />
      )}
      Facturar {extras} extra{extras === 1 ? "" : "s"} · {money}
    </button>
  )
}
