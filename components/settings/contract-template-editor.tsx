"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Trash2 } from "lucide-react"
import {
  createContractTemplateAction,
  updateContractTemplateAction,
  deleteContractTemplateAction,
} from "@/server/actions/contract.actions"

type Initial = {
  name: string
  description: string
  bodyHtml: string
  isDefault: boolean
  isActive: boolean
  defaultValidityDays: number | null
}

interface Props {
  mode: "create" | "edit"
  templateId?: string
  initial: Initial
}

// Placeholders sugeridos; el usuario puede usar los que quiera.
const SUGGESTED_VARS = [
  { key: "cliente_nombre", label: "Nombre del cliente" },
  { key: "cliente_email", label: "Email del cliente" },
  { key: "evento_fecha", label: "Fecha del evento" },
  { key: "evento_locacion", label: "Ubicación del evento" },
  { key: "paquete_nombre", label: "Nombre del paquete" },
  { key: "paquete_precio", label: "Precio del paquete" },
  { key: "moneda", label: "Moneda" },
  { key: "estudio_nombre", label: "Nombre del estudio" },
  { key: "hoy", label: "Fecha de hoy" },
]

export function ContractTemplateEditor({ mode, templateId, initial }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDelete] = useTransition()

  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [bodyHtml, setBodyHtml] = useState(initial.bodyHtml)
  const [isDefault, setIsDefault] = useState(initial.isDefault)
  const [isActive, setIsActive] = useState(initial.isActive)
  const [validityDays, setValidityDays] = useState<string>(
    initial.defaultValidityDays !== null
      ? String(initial.defaultValidityDays)
      : "",
  )
  const [bodyRef, setBodyRef] = useState<HTMLTextAreaElement | null>(null)

  const insertVar = (key: string) => {
    const placeholder = `{{${key}}}`
    if (bodyRef) {
      const start = bodyRef.selectionStart
      const end = bodyRef.selectionEnd
      const next = bodyHtml.slice(0, start) + placeholder + bodyHtml.slice(end)
      setBodyHtml(next)
      // Restore focus + place cursor after inserted token
      requestAnimationFrame(() => {
        bodyRef.focus()
        bodyRef.setSelectionRange(start + placeholder.length, start + placeholder.length)
      })
    } else {
      setBodyHtml((prev) => prev + placeholder)
    }
  }

  const submit = () => {
    if (!name.trim()) {
      toast.error("El nombre es requerido")
      return
    }
    if (!bodyHtml.trim()) {
      toast.error("El cuerpo del contrato no puede estar vacío")
      return
    }

    startTransition(async () => {
      const fd = new FormData()
      fd.set("name", name)
      fd.set("description", description)
      fd.set("bodyHtml", bodyHtml)
      fd.set("isDefault", isDefault ? "true" : "false")
      fd.set("isActive", isActive ? "true" : "false")
      fd.set("defaultValidityDays", validityDays.trim())

      const result =
        mode === "create"
          ? await createContractTemplateAction(fd)
          : await updateContractTemplateAction(templateId!, fd)

      if ("error" in result && result.error) {
        const messages = Object.values(result.error).flat().filter(Boolean) as string[]
        toast.error(messages[0] ?? "No pudimos guardar la plantilla")
        return
      }

      toast.success(mode === "create" ? "Plantilla creada" : "Cambios guardados")

      const newId =
        mode === "create"
          ? (result as { templateId?: string } | undefined)?.templateId
          : undefined
      if (newId) router.push(`/settings/contracts/${newId}`)
      else router.refresh()
    })
  }

  const remove = () => {
    if (!templateId) return
    if (!confirm("¿Eliminar esta plantilla? Los contratos ya generados con ella no se tocan.")) return
    startDelete(async () => {
      const res = await deleteContractTemplateAction(templateId)
      if ("error" in res && res.error) {
        toast.error(typeof res.error === "string" ? res.error : "No se pudo eliminar")
        return
      }
      toast.success("Plantilla eliminada")
      router.push("/settings/contracts")
    })
  }

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Nombre de la plantilla
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contrato XV años — paquete completo"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Validez por defecto (días)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value)}
              placeholder="Ej: 14"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Si el cliente no firma dentro de estos días, el contrato expira.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Descripción interna
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Para uso interno; el cliente no lo ve."
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-border-strong"
            />
            Usar como plantilla por defecto
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-border-strong"
            />
            Activa
          </label>
        </div>
      </section>

      <section className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground">Cuerpo del contrato</h2>
          <span className="text-[11px] text-muted-foreground">
            Soporta HTML básico y placeholders {"{{variable}}"}
          </span>
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {SUGGESTED_VARS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => insertVar(v.key)}
              title={v.label}
              className="px-2 py-1 text-[11px] border border-border rounded hover:bg-muted text-foreground"
            >
              {"{{"}
              {v.key}
              {"}}"}
            </button>
          ))}
        </div>

        <textarea
          ref={setBodyRef}
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          rows={18}
          className="w-full px-3 py-3 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          placeholder={`<h1>Contrato de servicios fotográficos</h1>\n<p>Entre {{estudio_nombre}} y {{cliente_nombre}}, se acuerda lo siguiente...</p>`}
        />
      </section>

      <div className="flex items-center justify-between">
        {mode === "edit" ? (
          <button
            type="button"
            onClick={remove}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-danger hover:bg-danger/10 rounded-lg disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Eliminar plantilla
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-brand-foreground text-sm font-medium rounded-lg hover:bg-brand/90 disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "create" ? "Crear plantilla" : "Guardar cambios"}
        </button>
      </div>
    </div>
  )
}
