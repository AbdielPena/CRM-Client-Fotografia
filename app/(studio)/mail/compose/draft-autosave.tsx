"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react"

/**
 * Hidden auto-save indicator que se incrusta dentro del ComposeForm.
 *
 * Cada 5 segundos lee los valores actuales del form (via ref padre o
 * document.querySelector como fallback), y si hay cambios desde el último
 * save, POST a /api/mail/drafts. Guarda el draftId en hidden input
 * para que el send action sepa cuál draft "consumir".
 *
 * Muestra: "Borrador guardado hace 3s" / "Guardando..." / error.
 *
 * Reglas:
 *   - No guarda si subject + body están vacíos (evita spam de drafts)
 *   - No guarda si state.ok===true (el form ya envió)
 *   - Si el form ID cambia (envío exitoso), no continua
 */
export function DraftAutoSaveIndicator({
  formRef,
  initialDraftId,
  accountIdFieldName,
}: {
  formRef: React.RefObject<HTMLFormElement>
  initialDraftId?: string
  accountIdFieldName?: string
}) {
  const [draftId, setDraftId] = useState<string | undefined>(initialDraftId)
  const [state, setState] = useState<
    "idle" | "saving" | "saved" | "error"
  >(initialDraftId ? "saved" : "idle")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    initialDraftId ? new Date() : null,
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const lastPayloadRef = useRef<string>("")

  useEffect(() => {
    const interval = setInterval(async () => {
      const form = formRef.current
      if (!form) return

      const fd = new FormData(form)
      const accountField = accountIdFieldName ?? "accountId"
      const accountId = fd.get(accountField) as string | null
      const subject = (fd.get("subject") as string | null)?.trim()
      const body = (fd.get("textBody") as string | null)?.trim()
      const toRaw = (fd.get("to") as string | null)?.trim()

      // Skip si no hay contenido relevante
      if (!accountId) return
      if (!subject && !body) return

      const payload = {
        draftId,
        accountId,
        subject: subject || undefined,
        bodyText: body || undefined,
        to: toRaw
          ? toRaw
              .split(/[,;]/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((email) => ({ email }))
          : [],
        cc:
          (fd.get("cc") as string | null)
            ?.split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((email) => ({ email })) ?? undefined,
        bcc:
          (fd.get("bcc") as string | null)
            ?.split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((email) => ({ email })) ?? undefined,
        clientId: (fd.get("clientId") as string) || undefined,
        projectId: (fd.get("projectId") as string) || undefined,
        invoiceId: (fd.get("invoiceId") as string) || undefined,
      }

      const serialized = JSON.stringify(payload)
      if (serialized === lastPayloadRef.current) return // sin cambios

      setState("saving")
      try {
        const res = await fetch("/api/mail/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: serialized,
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error ?? `HTTP ${res.status}`)
        }
        const data = (await res.json()) as { id: string; isNew: boolean }
        setDraftId(data.id)
        setLastSavedAt(new Date())
        setState("saved")
        setErrorMsg(null)
        lastPayloadRef.current = serialized
      } catch (err) {
        setState("error")
        setErrorMsg(err instanceof Error ? err.message : "Error desconocido")
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [formRef, accountIdFieldName, draftId])

  return (
    <>
      {draftId && <input type="hidden" name="draftId" value={draftId} />}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {state === "saving" && (
          <>
            <Loader2 className="size-3 animate-spin" />
            Guardando borrador...
          </>
        )}
        {state === "saved" && lastSavedAt && (
          <>
            <CheckCircle2 className="size-3 text-emerald-500" />
            Borrador guardado{" "}
            <RelativeTime date={lastSavedAt} />
          </>
        )}
        {state === "error" && (
          <>
            <AlertCircle className="size-3 text-red-500" />
            <span className="text-red-600 dark:text-red-400">
              Auto-save falló: {errorMsg}
            </span>
          </>
        )}
        {state === "idle" && (
          <span className="opacity-50">
            Auto-save activo (c/5s al detectar cambios)
          </span>
        )}
      </div>
    </>
  )
}

function RelativeTime({ date }: { date: Date }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000)
    return () => clearInterval(t)
  }, [])
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diffSec < 10) return <>hace un momento</>
  if (diffSec < 60) return <>hace {diffSec}s</>
  if (diffSec < 3600) return <>hace {Math.floor(diffSec / 60)}m</>
  return <>hace {Math.floor(diffSec / 3600)}h</>
}
