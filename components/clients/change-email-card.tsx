"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AtSign, Loader2, MailWarning, Send } from "lucide-react"

import {
  changeClientEmailAction,
  previewClientEmailChangeAction,
} from "@/server/actions/client-email.actions"
import { formatDateShort } from "@/lib/utils/currency"

/**
 * Cambiar el correo de un cliente, con su resumen antes de aplicar.
 *
 * Son dos pasos a propósito. Cambiar el correo no es solo editar un campo: hay
 * avisos en cola que van a salir en minutos, copias del correo repartidas por
 * el sistema y, si el estudio lo pide, un reenvío de todo lo que ya se le mandó
 * al correo viejo. Eso último le escribe a la clienta, así que nunca puede
 * pasar de un tirón: primero se ve cuántos son y cuáles, después se decide.
 */

interface Preview {
  clienteNombre: string
  actual: string | null
  nuevo: string
  enCola: number
  enviados: number
  muestra: Array<{ id: string; asunto: string; fecha: string | null }>
  copias: number
  duplicadoCon: string | null
}

export function ChangeEmailCard({
  clientId,
  currentEmail,
}: {
  clientId: string
  currentEmail: string | null
}) {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [reenviar, setReenviar] = React.useState(false)
  const [cargando, setCargando] = React.useState<null | "revisar" | "aplicar">(null)

  const nuevoLimpio = email.trim().toLowerCase()
  const igual = !!currentEmail && nuevoLimpio === currentEmail.trim().toLowerCase()

  async function revisar() {
    setCargando("revisar")
    try {
      const fd = new FormData()
      fd.set("clientId", clientId)
      fd.set("email", nuevoLimpio)
      const res = await previewClientEmailChangeAction(fd)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setPreview(res.preview)
      setReenviar(false)
    } finally {
      setCargando(null)
    }
  }

  async function aplicar() {
    setCargando("aplicar")
    try {
      const fd = new FormData()
      fd.set("clientId", clientId)
      fd.set("email", nuevoLimpio)
      fd.set("reenviar", reenviar ? "true" : "false")
      const res = await changeClientEmailAction(fd)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      const partes = [`Correo actualizado a ${res.nuevo}`]
      if (res.redirigidos > 0) partes.push(`${res.redirigidos} en cola redirigidos`)
      if (res.reenviados > 0) partes.push(`${res.reenviados} reenviados`)
      toast.success(partes.join(" · "))
      setPreview(null)
      setEmail("")
      router.refresh()
    } finally {
      setCargando(null)
    }
  }

  return (
    <div className="sf-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <AtSign className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Cambiar correo</h2>
      </div>

      <p className="text-[12.5px] text-muted-foreground">
        Correo actual:{" "}
        <span className="font-medium text-foreground">
          {currentEmail ?? "sin correo"}
        </span>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setPreview(null)
          }}
          placeholder="correo nuevo@ejemplo.com"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <button
          type="button"
          onClick={revisar}
          disabled={!nuevoLimpio || igual || cargando !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {cargando === "revisar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Revisar cambio
        </button>
      </div>

      {igual ? (
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Ese es el correo que ya tiene.
        </p>
      ) : null}

      {preview ? (
        <div className="mt-4 space-y-3 rounded-xl border border-border/70 bg-muted/25 p-4">
          <p className="text-[12.5px] text-foreground">
            <span className="text-muted-foreground">{preview.actual ?? "sin correo"}</span>
            {" → "}
            <span className="font-semibold">{preview.nuevo}</span>
          </p>

          {preview.duplicadoCon ? (
            <p className="flex items-start gap-1.5 text-[12px] text-amber-700 dark:text-amber-400">
              <MailWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>{preview.duplicadoCon}</strong> ya usa ese correo. Puedes
                seguir —a veces la madre y la hija comparten uno— pero revísalo.
              </span>
            </p>
          ) : null}

          <ul className="space-y-1 text-[12px] text-muted-foreground">
            <li>
              <strong className="text-foreground">{preview.enCola}</strong> correos en
              cola sin enviar: salen al correo nuevo.
            </li>
            <li>
              <strong className="text-foreground">{preview.copias}</strong> copias del
              correo (reserva, formularios, galerías): se actualizan.
            </li>
            <li>
              <strong className="text-foreground">{preview.enviados}</strong> correos ya
              enviados al correo viejo.
            </li>
          </ul>

          {preview.enviados > 0 ? (
            <div className="space-y-2 rounded-lg border border-border/70 bg-background p-3">
              <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-foreground">
                <input
                  type="checkbox"
                  checked={reenviar}
                  onChange={(e) => setReenviar(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Reenviar al correo nuevo los {preview.enviados} correos que ya se
                  enviaron
                  <span className="block text-[11.5px] text-muted-foreground">
                    Le llegarán de nuevo tal como salieron, con los mismos enlaces. No
                    se repite nada que ya se haya reenviado antes.
                  </span>
                </span>
              </label>

              {preview.muestra.length > 0 ? (
                <div className="border-t border-border/60 pt-2">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Últimos enviados
                  </p>
                  <ul className="space-y-0.5">
                    {preview.muestra.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-baseline justify-between gap-3 text-[11.5px]"
                      >
                        <span className="truncate text-foreground/80">{m.asunto}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {m.fecha
                            ? formatDateShort(new Date(m.fecha))
                            : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={aplicar}
            disabled={cargando !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {cargando === "aplicar" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {reenviar ? `Cambiar y reenviar ${preview.enviados}` : "Cambiar correo"}
          </button>
        </div>
      ) : null}
    </div>
  )
}
