"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, Eye, RotateCcw, Variable } from "lucide-react"
import { toast } from "sonner"

import { sanitizeHtml } from "@/lib/utils/sanitize-html"

type CatalogEntry = {
  label: string
  description: string
  defaultSubject: string
  defaultBodyHtml: string
  variables: { key: string; label: string; example: string }[]
}

type Tpl = {
  subject: string
  body_html: string
  from_name: string | null
  reply_to: string | null
  is_active: boolean
}

function renderInline(
  body: string,
  vars: Record<string, string>,
): string {
  return body.replace(
    /\{\{\s*([\w-]+)(?:\s*\|\s*([^}]+))?\s*\}\}/g,
    (_, key: string, fb?: string) => {
      const v = vars[key]
      if (v !== undefined && v !== "") return v
      if (fb) return fb.trim()
      return `<span style="background:#fef3c7;color:#92400e;padding:0 4px;border-radius:3px">{{${key}}}</span>`
    },
  )
}

export function TemplateEditor({
  slug,
  catalog,
  initialTemplate,
}: {
  slug: string
  catalog: CatalogEntry
  initialTemplate: Tpl | null
}) {
  const router = useRouter()
  const [subject, setSubject] = useState(
    initialTemplate?.subject ?? catalog.defaultSubject,
  )
  const [bodyHtml, setBodyHtml] = useState(
    initialTemplate?.body_html ?? catalog.defaultBodyHtml,
  )
  const [fromName, setFromName] = useState(initialTemplate?.from_name ?? "")
  const [replyTo, setReplyTo] = useState(initialTemplate?.reply_to ?? "")
  const [isActive, setIsActive] = useState(initialTemplate?.is_active ?? true)
  const [pending, startTransition] = useTransition()

  const exampleVars = useMemo(() => {
    const m: Record<string, string> = {}
    for (const v of catalog.variables) m[v.key] = v.example
    return m
  }, [catalog.variables])

  const previewSubject = useMemo(
    () => renderInline(subject, exampleVars).replace(/<[^>]+>/g, ""),
    [subject, exampleVars],
  )
  const previewBody = useMemo(
    () => renderInline(bodyHtml, exampleVars),
    [bodyHtml, exampleVars],
  )

  const insertVar = (key: string) => {
    setBodyHtml((b) => `${b} {{${key}}}`)
  }

  const save = () => {
    startTransition(async () => {
      const res = await fetch(`/api/settings/email-templates/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body_html: bodyHtml,
          from_name: fromName || null,
          reply_to: replyTo || null,
          is_active: isActive,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || data.error) {
        toast.error(data.error ?? "No se pudo guardar")
        return
      }
      toast.success("Plantilla guardada")
      router.refresh()
    })
  }

  const reset = () => {
    if (
      !confirm(
        "Restablecer al texto por defecto del sistema. ¿Continuar? (no se borra de DB hasta guardar)",
      )
    )
      return
    setSubject(catalog.defaultSubject)
    setBodyHtml(catalog.defaultBodyHtml)
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Editor */}
      <div className="space-y-4 lg:col-span-2">
        <div className="sf-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Editor</h3>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-border accent-violet-600"
              />
              Activa (usar esta plantilla)
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                Asunto
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cuerpo HTML
              </label>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={14}
                className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[12.5px] focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Usá variables tipo <code>{"{{client_name}}"}</code> o con fallback{" "}
                <code>{"{{ var | texto si vacío }}"}</code>.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  From name (opcional)
                </label>
                <input
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Default: nombre del estudio"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Reply-to (opcional)
                </label>
                <input
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="Default: email del estudio"
                  type="email"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar plantilla
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar por defecto
            </button>
          </div>
        </div>

        {/* Vista previa */}
        <div className="sf-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Vista previa</h3>
            <span className="text-[11px] text-muted-foreground">
              Variables reemplazadas con valores de ejemplo
            </span>
          </div>
          <div className="space-y-2">
            <div className="rounded-md bg-muted/40 p-2.5 text-[12.5px]">
              <span className="text-muted-foreground">Asunto:</span>{" "}
              <strong>{previewSubject}</strong>
            </div>
            {/* Réplica del marco minimalista real del correo (wrapLuxuryEmail) */}
            <div style={{ background: "#F0F1F4", padding: "20px 10px", borderRadius: 12 }}>
              <div
                style={{
                  maxWidth: 600,
                  margin: "0 auto",
                  background: "#fff",
                  border: "1px solid #ECECEF",
                  borderRadius: 18,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "26px 36px",
                    textAlign: "center",
                    borderBottom: "1px solid #ECECEF",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      background: "#1C1C1C",
                      borderRadius: 12,
                      padding: "10px 18px",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: 15,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {exampleVars["studio_name"] || "Tu Estudio"}
                  </span>
                </div>
                <div
                  className="prose prose-sm max-w-none"
                  style={{
                    padding: "34px 38px 28px",
                    fontFamily: "Inter, -apple-system, sans-serif",
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: "#6E6E73",
                  }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewBody) }}
                />
                <div
                  style={{
                    padding: "20px 36px 26px",
                    textAlign: "center",
                    borderTop: "1px solid #ECECEF",
                    fontSize: 11.5,
                    color: "#A1A1A6",
                  }}
                >
                  {exampleVars["studio_name"] || "Tu Estudio"} · Este mensaje es solo para ti.
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Así se verá dentro del marco real (con tu logo en lugar del nombre, y tu footer con redes/WhatsApp).
            </p>
          </div>
        </div>
      </div>

      {/* Variables disponibles */}
      <div className="sf-card p-5 h-fit">
        <div className="flex items-center gap-2">
          <Variable className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Variables disponibles
          </h3>
        </div>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Click en una para insertarla en el cuerpo del email.
        </p>
        <ul className="mt-3 space-y-1.5">
          {catalog.variables.map((v) => (
            <li key={v.key}>
              <button
                type="button"
                onClick={() => insertVar(v.key)}
                className="group flex w-full items-start gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-left text-[12px] hover:border-violet-300 hover:bg-violet-50 dark:hover:border-violet-700 dark:hover:bg-violet-500/10"
              >
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-foreground">
                  {`{{${v.key}}}`}
                </code>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{v.label}</p>
                  <p className="truncate text-[10.5px] text-muted-foreground">
                    Ej: {v.example}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
