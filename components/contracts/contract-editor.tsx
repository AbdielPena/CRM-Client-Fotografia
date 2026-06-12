"use client"

import { useState, useTransition } from "react"
import { createContractAction } from "@/server/actions/contract.actions"
import { renderContractPreview } from "@/lib/contracts/preview"
import { sanitizeHtml } from "@/lib/utils/sanitize-html"
import Link from "next/link"

interface Project {
  id: string
  name: string
  clientId: string
  clientName: string
  type: string
  eventDate?: string
  location?: string
  totalAmount?: number
  currency: string
}

interface Template {
  id: string
  name: string
  body: string
}

interface ContractEditorProps {
  projects: Project[]
  templates: Template[]
  defaultProjectId?: string
  defaultBody: string
}

export function ContractEditor({
  projects,
  templates,
  defaultProjectId,
  defaultBody,
}: ContractEditorProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId ?? "")
  const [body, setBody] = useState(defaultBody)
  const [title, setTitle] = useState("Contrato de servicios fotográficos")
  const [showPreview, setShowPreview] = useState(false)
  const [isPending, startTransition] = useTransition()

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  const handleProjectChange = (id: string) => {
    setSelectedProjectId(id)
  }

  const handleTemplateChange = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId)
    if (tmpl) setBody(tmpl.body)
  }

  // Quick variable insertion
  const insertVariable = (v: string) => {
    setBody((prev) => prev + `{{${v}}}`)
  }

  const VARIABLES = [
    "cliente_nombre", "estudio_nombre", "paquete_nombre",
    "precio_total", "anticipo", "saldo_reserva",
    "evento_fecha", "evento_locacion", "hoy",
    "signature_client", "signature_studio",
  ]

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("body", body)
    startTransition(async () => {
      await createContractAction(fd)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Project + Template */}
      <div className="bg-card rounded-xl border border-border p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-1">
            Proyecto <span className="text-danger">*</span>
          </label>
          <select
            name="projectId"
            required
            value={selectedProjectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-card"
          >
            <option value="">Seleccionar proyecto...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.clientName}
              </option>
            ))}
          </select>
          {selectedProject && (
            <input type="hidden" name="clientId" value={selectedProject.clientId} />
          )}
        </div>

        {templates.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Plantilla
            </label>
            <select
              name="templateId"
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-card"
            >
              <option value="">Sin plantilla</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-1">Título</label>
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Fecha de expiración
          </label>
          <input
            name="expiresAt"
            type="date"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </div>
      </div>

      {/* Contract body editor */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Contenido del contrato</h2>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-border rounded-lg hover:bg-muted"
            >
              {showPreview ? "Ocultar preview" : "👁 Vista previa"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                className="px-2 py-0.5 text-xs bg-brand-soft text-brand rounded hover:bg-blue-100 transition-colors font-mono"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={28}
          className="w-full px-5 py-4 text-sm font-mono text-foreground focus:outline-none resize-none"
          placeholder="Escribe el contenido del contrato en Markdown..."
        />
        <div className="px-5 py-2 border-t border-border bg-muted">
          <p className="text-xs text-muted-foreground">
            Soporta HTML básico. Las variables entre <code className="bg-muted px-1 rounded">{"{{"}…{"}}"}</code> se reemplazan con los datos reales al generar el contrato.
          </p>
        </div>

        {showPreview && (
          <div className="client-luxe border-t border-border bg-[#faf7f2] p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Vista previa · con datos de ejemplo
            </p>
            <div className="lx-card mx-auto max-w-2xl p-8">
              <div
                className="contract-body prose prose-sm max-w-none text-foreground/90 dark:prose-invert"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(renderContractPreview(body)),
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || !selectedProjectId}
          className="px-5 py-2.5 bg-brand text-brand-foreground text-sm font-medium rounded-lg hover:bg-brand/90 transition-colors disabled:opacity-50"
        >
          {isPending ? "Creando..." : "Crear contrato"}
        </button>
        <Link
          href="/contracts"
          className="px-5 py-2.5 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
