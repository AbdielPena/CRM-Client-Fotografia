"use client"

import { useState, useTransition } from "react"
import {
  Webhook,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  PauseCircle,
  PlayCircle,
} from "lucide-react"

import {
  createWebhookAction,
  deleteWebhookAction,
  toggleWebhookAction,
} from "@/server/actions/outbound-webhook.actions"
import type { OutboundWebhookRow } from "@/server/services/outbound-webhook.service"
import { Button } from "@/components/ui/button"

const EVENT_OPTIONS = [
  { value: "client.created", label: "Cliente creado" },
  { value: "client.updated", label: "Cliente actualizado" },
  { value: "lead.created", label: "Lead nuevo" },
  { value: "project.created", label: "Proyecto creado" },
  { value: "project.status_changed", label: "Proyecto cambió estado" },
  { value: "project.completed", label: "Proyecto completado" },
  { value: "invoice.created", label: "Factura creada" },
  { value: "invoice.sent", label: "Factura enviada" },
  { value: "invoice.paid", label: "Factura pagada" },
  { value: "payment.received", label: "Pago recibido" },
  { value: "booking.received", label: "Reserva recibida" },
  { value: "gallery.published", label: "Galería publicada" },
  { value: "task.completed", label: "Tarea completada" },
]

export function WebhooksManager({
  webhooks,
}: {
  webhooks: OutboundWebhookRow[]
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleCreate(formData: FormData) {
    startTransition(async () => {
      const res = await createWebhookAction(formData)
      if (res.ok && res.secret) {
        setNewSecret(res.secret)
        setShowCreate(false)
      } else {
        setFeedback(res.message ?? "Error")
      }
    })
  }

  async function handleToggle(id: string, current: boolean) {
    startTransition(async () => {
      const res = await toggleWebhookAction(id, !current)
      if (!res.ok) setFeedback(res.message ?? "Error")
      else window.location.reload()
    })
  }

  async function handleDelete(id: string) {
    if (!window.confirm("¿Eliminar webhook?")) return
    startTransition(async () => {
      const res = await deleteWebhookAction(id)
      setFeedback(res.message ?? "")
      if (res.ok) window.location.reload()
    })
  }

  function copySecret() {
    if (!newSecret) return
    navigator.clipboard.writeText(newSecret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {newSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-base font-bold">Webhook secret</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Usa este secret para verificar la firma HMAC. Guárdalo —
              después solo verás el prefix.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">
                {newSecret}
              </code>
              <Button onClick={copySecret} size="sm" variant="outline">
                {copied ? (
                  <>
                    <CheckCircle2 className="mr-1 size-3.5 text-emerald-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 size-3.5" />
                    Copiar
                  </>
                )}
              </Button>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => window.location.reload()}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      <section className="sf-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Webhooks ({webhooks.length})
          </h3>
          <Button
            onClick={() => setShowCreate(!showCreate)}
            size="sm"
            variant={showCreate ? "outline" : "default"}
          >
            {showCreate ? (
              "Cancelar"
            ) : (
              <>
                <Plus className="mr-1 size-3.5" />
                Nuevo webhook
              </>
            )}
          </Button>
        </div>

        {feedback && (
          <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {feedback}
          </div>
        )}

        {showCreate && (
          <form
            action={handleCreate}
            className="mb-4 space-y-3 rounded-xl border border-input bg-muted/30 p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Zapier integration"
                  className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  URL HTTPS <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  name="url"
                  required
                  placeholder="https://hooks.zapier.com/..."
                  pattern="https://.*"
                  className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Eventos a escuchar <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {EVENT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      name="events"
                      value={opt.value}
                      className="rounded border-input"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Custom headers (JSON, opcional)
              </label>
              <textarea
                name="customHeadersJson"
                rows={2}
                placeholder='{"X-Custom-Auth": "value"}'
                className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
              />
            </div>
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1 size-3.5" />
              )}
              Crear webhook
            </Button>
          </form>
        )}

        {webhooks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-input p-6 text-center text-xs text-muted-foreground">
            Sin webhooks configurados. Crea uno para empezar.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {webhooks.map((wh) => (
              <li key={wh.id} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {wh.name}
                      {wh.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <CheckCircle2 className="size-2.5" />
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                          <PauseCircle className="size-2.5" />
                          Pausado
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      <code className="font-mono">{wh.url}</code>
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {wh.events.length} eventos · {wh.total_deliveries}{" "}
                      entregas · {wh.total_failures} fallos
                      {wh.consecutive_failures > 0 && (
                        <span className="ml-1 text-red-600">
                          ({wh.consecutive_failures} seguidos)
                        </span>
                      )}
                    </p>
                    {wh.last_error && (
                      <p className="mt-1 flex items-start gap-1 text-[10px] text-red-600">
                        <AlertCircle className="mt-0.5 size-2.5 shrink-0" />
                        {wh.last_error.slice(0, 100)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      onClick={() => handleToggle(wh.id, wh.is_active)}
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                    >
                      {wh.is_active ? (
                        <PauseCircle className="size-3.5" />
                      ) : (
                        <PlayCircle className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      onClick={() => handleDelete(wh.id)}
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
