"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Crown, Loader2, Mail } from "lucide-react"
import { toast } from "sonner"

import { sendQuinceNameRequestsAction } from "@/server/actions/project.actions"

/**
 * Banner + botón: envía por correo el link para registrar el nombre de la
 * quinceañera a los clientes de sesiones que aún no lo tienen. `count` viene del
 * server (sesiones quinceañera sin nombre y con email).
 */
export function RequestQuinceNamesButton({ count }: { count: number }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [confirming, setConfirming] = useState(false)

  if (count <= 0) return null

  const send = () => {
    start(async () => {
      const r = await sendQuinceNameRequestsAction()
      setConfirming(false)
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo enviar")
        return
      }
      if (!r.sent) {
        toast.message("No había clientes pendientes por notificar.")
      } else {
        toast.success(`Correo enviado a ${r.sent} cliente${r.sent === 1 ? "" : "s"} 💛`)
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex items-start gap-2 min-w-0">
        <Crown className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <p className="text-[13px] text-amber-900 dark:text-amber-200">
          <strong>{count}</strong> sesión{count === 1 ? "" : "es"} de quinceañera sin el
          nombre de la niña registrado. Envíales un correo para que lo inscriban.
        </p>
      </div>
      {confirming ? (
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={send}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Confirmar envío a {count}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
        >
          <Mail className="h-3.5 w-3.5" /> Pedir nombre por correo
        </button>
      )}
    </div>
  )
}
