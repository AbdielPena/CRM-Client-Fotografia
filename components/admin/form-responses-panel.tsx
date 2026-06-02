"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  ClipboardList,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Copy,
  CheckCircle2,
  Clock,
  Eye,
  Send,
  Loader2,
} from "lucide-react"
import type { FormResponseSummary } from "@/server/services/form.service"
import { sendFormToClientAction } from "@/server/actions/form.actions"

interface Props {
  responses: FormResponseSummary[]
  publicBaseUrl: string
  bookingId?: string | null
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  sent: "bg-brand-soft text-brand",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  expired: "bg-danger/10 text-danger",
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  sent: "Enviado",
  in_progress: "En progreso",
  completed: "Completado",
  expired: "Expirado",
}

export function FormResponsesPanel({ responses, publicBaseUrl, bookingId }: Props) {
  const [expanded, setExpanded] = useState<string | null>(
    responses.find((r) => r.status === "completed")?.id ?? null,
  )
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSend = (responseId: string, alreadySent: boolean) => {
    setSendingId(responseId)
    startTransition(async () => {
      const result = await sendFormToClientAction(responseId, { bookingId })
      setSendingId(null)
      if ("error" in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(alreadySent ? "Formulario reenviado al cliente" : "Formulario enviado al cliente")
    })
  }

  if (responses.length === 0) {
    return (
      <section className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Formularios</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          No hay formularios asociados todavía.
        </p>
      </section>
    )
  }

  return (
    <section className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Formularios</h2>
          <span className="text-xs text-muted-foreground">
            ({responses.length})
          </span>
        </div>
      </div>

      <ul className="divide-y divide-gray-50">
        {responses.map((r) => {
          const publicUrl = `${publicBaseUrl}/f/${r.accessToken}`
          const open = expanded === r.id
          return (
            <li key={r.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : r.id)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {r.templateName}
                    </p>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        STATUS_STYLES[r.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    {r.completedAt && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        Completado{" "}
                        {new Date(r.completedAt).toLocaleDateString("es", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                    {r.firstViewedAt && !r.completedAt && (
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        Visto{" "}
                        {new Date(r.firstViewedAt).toLocaleDateString("es", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                    {r.expiresAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Expira{" "}
                        {new Date(r.expiresAt).toLocaleDateString("es", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-1">
                  {r.status !== "completed" && r.status !== "expired" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSend(r.id, r.status !== "pending")
                      }}
                      disabled={isPending && sendingId === r.id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-brand-foreground bg-brand hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      title={r.status === "pending" ? "Enviar al cliente" : "Reenviar al cliente"}
                    >
                      {isPending && sendingId === r.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                      {r.status === "pending" ? "Enviar" : "Reenviar"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation()
                      try {
                        await navigator.clipboard.writeText(publicUrl)
                        toast.success("Enlace copiado")
                      } catch {
                        toast.error("No se pudo copiar")
                      }
                    }}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded"
                    title="Copiar enlace público"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded"
                    title="Abrir en nueva pestaña"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : r.id)}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded"
                  >
                    {open ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {open && <AnswersView response={r} />}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function AnswersView({ response }: { response: FormResponseSummary }) {
  const fields = response.schema.fields ?? []
  const data = response.data

  if (fields.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        La plantilla de este formulario no tiene campos.
      </p>
    )
  }

  const anyAnswer = fields.some((f) => {
    const v = data[f.key]
    return v !== undefined && v !== null && v !== ""
  })

  if (!anyAnswer) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        El cliente aún no ha respondido ningún campo.
      </p>
    )
  }

  return (
    <dl className="mt-3 bg-muted rounded-lg p-4 space-y-3">
      {fields.map((f) => {
        const raw = data[f.key]
        return (
          <div key={f.key}>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {f.label}
            </dt>
            <dd className="text-sm text-foreground mt-0.5">
              {formatValue(f, raw)}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function formatValue(
  field: { type: string; options?: { value: string; label: string }[] },
  raw: unknown,
): React.ReactNode {
  if (raw === undefined || raw === null || raw === "") {
    return <span className="text-muted-foreground italic">— sin respuesta —</span>
  }

  if (field.type === "checkbox") {
    return raw === true ? "Sí" : "No"
  }

  if (field.type === "select" || field.type === "radio") {
    const opt = (field.options ?? []).find((o) => o.value === String(raw))
    return opt ? opt.label : String(raw)
  }

  if (field.type === "date") {
    try {
      return new Date(String(raw)).toLocaleDateString("es", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    } catch {
      return String(raw)
    }
  }

  if (field.type === "textarea") {
    return (
      <span className="whitespace-pre-line">{String(raw)}</span>
    )
  }

  return String(raw)
}
