"use client"

import { useState, useTransition } from "react"
import { createContractAction } from "@/server/actions/contract.actions"
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
    "clientName", "studioName", "eventType", "eventDate",
    "location", "totalAmount", "depositAmount",
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
      <div className="bg-white rounded-xl border border-gray-200 p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Proyecto <span className="text-red-500">*</span>
          </label>
          <select
            name="projectId"
            required
            value={selectedProjectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plantilla
            </label>
            <select
              name="templateId"
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fecha de expiración
          </label>
          <input
            name="expiresAt"
            type="date"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
      </div>

      {/* Contract body editor */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Contenido del contrato</h2>
          <div className="flex flex-wrap gap-1">
            {VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors font-mono"
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
          className="w-full px-5 py-4 text-sm font-mono text-gray-700 focus:outline-none resize-none"
          placeholder="Escribe el contenido del contrato en Markdown..."
        />
        <div className="px-5 py-2 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400">
            Usa Markdown para formatear. Las variables entre <code className="bg-gray-200 px-1 rounded">{"{{"}…{"}}"}</code> serán reemplazadas automáticamente.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || !selectedProjectId}
          className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {isPending ? "Creando..." : "Crear contrato"}
        </button>
        <Link
          href="/contracts"
          className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
