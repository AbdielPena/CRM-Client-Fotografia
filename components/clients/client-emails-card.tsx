"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { BellOff, BellRing, Loader2, MailX } from "lucide-react"

import {
  cancelClientQueuedEmailsAction,
  pauseClientEmailsAction,
  resumeClientEmailsAction,
} from "@/server/actions/email-automation.actions"
import { formatDateShort } from "@/lib/utils/currency"

/**
 * Interruptor general de los correos de UN cliente.
 *
 * Pausar corta TODO lo que el sistema le mandaría por su cuenta —recordatorios,
 * facturas, avisos de galería— y vacía lo que tuviera en cola. Es deliberado:
 * cuando el estudio ya resolvió el asunto por WhatsApp, cualquier correo que
 * siga saliendo lo deja quedando mal.
 *
 * No cancela la sesión ni borra nada. Solo calla los correos.
 */

export function ClientEmailsCard({
  clientId,
  paused,
  pausedAt,
  reason,
  pendientes,
}: {
  clientId: string
  paused: boolean
  pausedAt: string | null
  reason: string | null
  pendientes: number
}) {
  const router = useRouter()
  const [cargando, setCargando] = React.useState<null | "pause" | "resume" | "clear">(null)
  const [motivo, setMotivo] = React.useState("")
  const [confirmando, setConfirmando] = React.useState(false)

  async function pausar() {
    setCargando("pause")
    try {
      const fd = new FormData()
      fd.set("clientId", clientId)
      fd.set("reason", motivo)
      const res = await pauseClientEmailsAction(fd)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      const cancelados = res.cancelados ?? 0
      toast.success(
        cancelados > 0
          ? `Correos pausados. Se cancelaron ${cancelados} en cola.`
          : "Correos pausados.",
      )
      setConfirmando(false)
      setMotivo("")
      router.refresh()
    } finally {
      setCargando(null)
    }
  }

  async function reanudar() {
    setCargando("resume")
    try {
      const fd = new FormData()
      fd.set("clientId", clientId)
      const res = await resumeClientEmailsAction(fd)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success("Correos reanudados.")
      router.refresh()
    } finally {
      setCargando(null)
    }
  }

  async function vaciarCola() {
    setCargando("clear")
    try {
      const fd = new FormData()
      fd.set("clientId", clientId)
      const res = await cancelClientQueuedEmailsAction(fd)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      const cancelados = res.cancelados ?? 0
      toast.success(
        cancelados > 0
          ? `Se cancelaron ${cancelados} correos en cola.`
          : "No había nada en cola.",
      )
      router.refresh()
    } finally {
      setCargando(null)
    }
  }

  return (
    <div className="sf-card p-5">
      <div className="mb-3 flex items-center gap-2">
        {paused ? (
          <BellOff className="h-4 w-4 text-amber-500" />
        ) : (
          <BellRing className="h-4 w-4 text-brand" />
        )}
        <h2 className="text-sm font-semibold text-foreground">
          Correos automáticos
        </h2>
      </div>

      {paused ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            En pausa{pausedAt ? ` desde el ${formatDateShort(new Date(pausedAt))}` : ""}
          </p>
          <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
            No le sale ningún correo del sistema: ni recordatorios, ni facturas,
            ni avisos de galería. Si publicas su entrega, el correo no saldrá
            hasta que reanudes.
          </p>
          {reason && (
            <p className="mt-2 text-xs italic text-amber-800/70 dark:text-amber-200/70">
              “{reason}”
            </p>
          )}
          <button
            type="button"
            onClick={reanudar}
            disabled={cargando !== null}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-xs font-medium text-background disabled:opacity-50"
          >
            {cargando === "resume" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Reanudar correos
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Recibe con normalidad los recordatorios y avisos de sus sesiones.
          </p>

          {!confirmando ? (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted/50"
            >
              <BellOff className="h-3.5 w-3.5" />
              Pausar todos sus correos
            </button>
          ) : (
            <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3.5">
              <label
                htmlFor={`motivo-${clientId}`}
                className="mb-1.5 block text-xs font-medium text-foreground"
              >
                ¿Por qué? (opcional, solo lo ves tú)
              </label>
              <input
                id={`motivo-${clientId}`}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ya coordinamos todo por WhatsApp"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Se cancela también lo que tenga esperando en cola. Puedes
                reanudarlo cuando quieras.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={pausar}
                  disabled={cargando !== null}
                  className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-xs font-medium text-background disabled:opacity-50"
                >
                  {cargando === "pause" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Sí, pausar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className="rounded-lg border border-border px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted/50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {pendientes > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">
            {pendientes === 1
              ? "1 correo suyo esperando salir."
              : `${pendientes} correos suyos esperando salir.`}
          </p>
          <button
            type="button"
            onClick={vaciarCola}
            disabled={cargando !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 disabled:opacity-50"
          >
            {cargando === "clear" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MailX className="h-3.5 w-3.5" />
            )}
            Cancelarlos
          </button>
        </div>
      )}
    </div>
  )
}
