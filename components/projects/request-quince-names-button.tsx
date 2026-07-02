"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Copy, Crown, Loader2, Mail, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { sendQuinceNameRequestsAction } from "@/server/actions/project.actions"
import { cn } from "@/lib/utils/cn"

export type QuinceMissingRow = {
  projectId: string
  projectName: string
  clientName: string
  clientWhatsapp: string | null
  url: string
  missingName: boolean
  missingBirthday: boolean
}

/**
 * Banner + panel para las sesiones de quinceañera sin el nombre y/o cumpleaños
 * registrado. Permite: enviar el correo masivo (a los que tienen email) y
 * copiar/compartir por WhatsApp el link individual de cada cliente.
 */
export function RequestQuinceNamesButton({ rows }: { rows: QuinceMissingRow[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  if (!rows || rows.length === 0) return null
  const count = rows.length

  const send = () => {
    start(async () => {
      const r = await sendQuinceNameRequestsAction()
      setConfirming(false)
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo enviar")
        return
      }
      if (!r.sent) toast.message("No había clientes con correo para notificar.")
      else toast.success(`Correo enviado a ${r.sent} cliente${r.sent === 1 ? "" : "s"} 💛`)
      router.refresh()
    })
  }

  const copy = async (row: QuinceMissingRow) => {
    try {
      await navigator.clipboard.writeText(row.url)
      setCopied(row.projectId)
      toast.success("Link copiado")
      setTimeout(() => setCopied((c) => (c === row.projectId ? null : c)), 1800)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  const waHref = (row: QuinceMissingRow): string | null => {
    const digits = (row.clientWhatsapp ?? "").replace(/\D/g, "")
    if (!digits) return null
    const first = (row.clientName || "").split(" ")[0] || ""
    const msg = `¡Hola ${first}! 💛 Para preparar tu sesión necesitamos el nombre y la fecha de cumpleaños de la quinceañera. Complétalo aquí (1 minuto): ${row.url}`
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
  }

  const faltan = (row: QuinceMissingRow) =>
    [row.missingName ? "nombre" : null, row.missingBirthday ? "cumpleaños" : null]
      .filter(Boolean)
      .join(" y ")

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2">
          <Crown className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="text-[13px] text-amber-900 dark:text-amber-200">
            <strong>{count}</strong> sesión{count === 1 ? "" : "es"} de quinceañera sin el
            nombre y/o cumpleaños de la niña. Pídeselo al cliente por correo o mándale su
            link directo.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
          >
            Links por cliente
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>
          {confirming ? (
            <>
              <button
                onClick={send}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                Confirmar envío
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
            >
              <Mail className="h-3.5 w-3.5" /> Pedir por correo
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-amber-200 dark:border-amber-500/20">
          <ul className="divide-y divide-amber-200/70 dark:divide-amber-500/20">
            {rows.map((row) => {
              const wa = waHref(row)
              return (
                <li
                  key={row.projectId}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-amber-900 dark:text-amber-100">
                      {row.clientName || "Cliente sin nombre"}
                    </p>
                    <p className="truncate text-[11px] text-amber-700/80 dark:text-amber-300/70">
                      {row.projectName} · falta {faltan(row)}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => copy(row)}
                      className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11.5px] font-medium text-amber-800 transition-colors hover:bg-amber-100"
                    >
                      {copied === row.projectId ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied === row.projectId ? "Copiado" : "Copiar link"}
                    </button>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-[#25D366] px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-[#1eb858]"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
