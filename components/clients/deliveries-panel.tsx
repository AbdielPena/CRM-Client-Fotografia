"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import {
  Package,
  Plus,
  Send,
  Check,
  X,
  Trash2,
  Upload,
  Link as LinkIcon,
  Loader2,
  ExternalLink,
} from "lucide-react"
import { toast } from "sonner"

type DeliveryFile = { name: string; url: string; size?: number; mime?: string }
type ExtLink = { label: string; url: string }
type Delivery = {
  id: string
  title: string
  description: string | null
  status: "pending" | "delivered" | "reviewed"
  delivered_at: string | null
  reviewed_at: string | null
  files: DeliveryFile[]
  external_links: ExtLink[]
  created_at: string
}

const STATUS_LABEL: Record<Delivery["status"], string> = {
  pending: "Pendiente",
  delivered: "Entregada",
  reviewed: "Revisada",
}

const STATUS_COLOR: Record<Delivery["status"], string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  reviewed: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
}

function fmtDate(d: string | null) {
  if (!d) return ""
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d))
}

function fmtBytes(n?: number) {
  if (!n) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function DeliveriesPanel({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const reload = async () => {
    const res = await fetch(`/api/clients/${clientId}/deliveries`)
    if (res.ok) {
      const data = (await res.json()) as { deliveries: Delivery[] }
      setItems(data.deliveries ?? [])
    }
  }

  useEffect(() => {
    reload().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  const setStatus = async (id: string, status: Delivery["status"]) => {
    const res = await fetch(`/api/deliveries/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      toast.error("No se pudo actualizar")
      return
    }
    if (status === "delivered") toast.success("Marcada como entregada y email enviado al cliente")
    else toast.success(`Marcada como ${STATUS_LABEL[status].toLowerCase()}`)
    await reload()
  }

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta entrega? Esta acción no se puede deshacer.")) return
    const res = await fetch(`/api/deliveries/${id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("No se pudo eliminar")
      return
    }
    toast.success("Entrega eliminada")
    await reload()
  }

  return (
    <div className="sf-card">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            Entregas finales ({items.length})
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva entrega
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Aún no hay entregas. Subí las fotos editadas finales o links a archivos.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.map((d) => (
            <li key={d.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{d.title}</p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_COLOR[d.status]}`}
                    >
                      {STATUS_LABEL[d.status]}
                    </span>
                  </div>
                  {d.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {d.description}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {d.files.length} archivo{d.files.length === 1 ? "" : "s"} ·{" "}
                    {d.external_links.length} link
                    {d.external_links.length === 1 ? "" : "s"}
                    {d.delivered_at && ` · entregada ${fmtDate(d.delivered_at)}`}
                    {d.reviewed_at && ` · vista ${fmtDate(d.reviewed_at)}`}
                  </p>
                  {(d.files.length > 0 || d.external_links.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {d.files.map((f) => (
                        <a
                          key={f.url}
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground hover:bg-muted"
                        >
                          <Upload className="h-3 w-3 text-muted-foreground" />
                          <span className="max-w-[160px] truncate">{f.name}</span>
                          {f.size && <span className="text-muted-foreground">{fmtBytes(f.size)}</span>}
                        </a>
                      ))}
                      {d.external_links.map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground hover:bg-muted"
                        >
                          <LinkIcon className="h-3 w-3 text-muted-foreground" />
                          <span className="max-w-[160px] truncate">{l.label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                  {d.status !== "delivered" && d.status !== "reviewed" && (
                    <button
                      type="button"
                      onClick={() => setStatus(d.id, "delivered")}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
                    >
                      <Send className="h-3 w-3" />
                      Entregar y notificar
                    </button>
                  )}
                  {d.status === "delivered" && (
                    <button
                      type="button"
                      onClick={() => setStatus(d.id, "pending")}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted"
                    >
                      Volver a pendiente
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(d.id)}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                    Borrar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <NewDeliveryModal
          clientId={clientId}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false)
            void reload()
          }}
        />
      )}
    </div>
  )
}

function NewDeliveryModal({
  clientId,
  onClose,
  onCreated,
}: {
  clientId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [files, setFiles] = useState<DeliveryFile[]>([])
  const [links, setLinks] = useState<ExtLink[]>([])
  const [linkLabel, setLinkLabel] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/deliveries/upload", { method: "POST", body: fd })
      const data = (await res.json()) as DeliveryFile & { error?: string }
      if (!res.ok || (data as { error?: string }).error) {
        toast.error((data as { error?: string }).error ?? "Error subiendo")
        return
      }
      setFiles((prev) => [...prev, data])
      toast.success(`Subido: ${data.name}`)
    } catch {
      toast.error("Error de conexión")
    } finally {
      setUploading(false)
    }
  }

  const addLink = () => {
    if (!linkLabel.trim() || !linkUrl.trim()) return
    try {
      new URL(linkUrl)
    } catch {
      toast.error("URL inválida")
      return
    }
    setLinks((prev) => [...prev, { label: linkLabel.trim(), url: linkUrl.trim() }])
    setLinkLabel("")
    setLinkUrl("")
  }

  const submit = () => {
    if (!title.trim()) {
      toast.error("Título requerido")
      return
    }
    if (files.length === 0 && links.length === 0) {
      toast.error("Subí al menos un archivo o agregá un link")
      return
    }
    startTransition(async () => {
      const res = await fetch(`/api/clients/${clientId}/deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          files,
          externalLinks: links,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok || data.error) {
        toast.error(data.error ?? "No se pudo crear")
        return
      }
      toast.success("Entrega creada (pendiente). Marcala como entregada cuando esté lista.")
      onCreated()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Nueva entrega final
            </h3>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Subí archivos o agregá links externos. Cuando la marques como
              entregada, el cliente recibe email y la verá en su portal.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              Título *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='Ej: "Fotos editadas — boda"'
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional — instrucciones, notas para el cliente"
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              Archivos ({files.length})
            </label>
            <div className="rounded-md border border-dashed border-border bg-muted/40 p-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? [])
                  void Promise.all(fs.map((f) => upload(f)))
                  if (fileInputRef.current) fileInputRef.current.value = ""
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Subir archivos
              </button>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li
                      key={f.url}
                      className="flex items-center justify-between gap-2 text-[12px]"
                    >
                      <span className="truncate text-foreground">
                        {f.name}{" "}
                        <span className="text-muted-foreground">
                          ({fmtBytes(f.size)})
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-muted-foreground hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              Links externos ({links.length})
            </label>
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="flex gap-1.5">
                <input
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  placeholder="Ej: WeTransfer"
                  className="w-1/3 rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
                />
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addLink()}
                  placeholder="https://…"
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
                />
                <button
                  type="button"
                  onClick={addLink}
                  className="rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background"
                >
                  +
                </button>
              </div>
              {links.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {links.map((l, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 text-[12px]"
                    >
                      <span className="truncate text-foreground">
                        <strong>{l.label}</strong>{" "}
                        <span className="text-muted-foreground">{l.url}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setLinks((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-muted-foreground hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/80"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Crear entrega
          </button>
        </div>
      </div>
    </div>
  )
}
