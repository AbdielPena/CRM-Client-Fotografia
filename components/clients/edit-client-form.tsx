"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { AlertCircle, Loader2 } from "lucide-react"

import { updateClientAction } from "@/server/actions/client.actions"

export interface EditClientData {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string | null
  notes: string | null
  address: string | null
  city: string | null
  country: string | null
  instagramHandle: string | null
  websiteUrl: string | null
}

const SOURCES = [
  { value: "referral", label: "Referido" },
  { value: "website", label: "Sitio web" },
  { value: "social_media", label: "Redes sociales" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "inquiry_form", label: "Formulario" },
  { value: "public_link", label: "Link público" },
  { value: "manual", label: "Manual" },
  { value: "other", label: "Otro" },
]

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-card"

export function EditClientForm({ client }: { client: EditClientData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setFieldErrors({})
    startTransition(async () => {
      const result = await updateClientAction(client.id, fd)
      if (result?.error) {
        setFieldErrors(result.error as Record<string, string[]>)
        toast.error("Revisa los campos marcados")
        return
      }
      toast.success("Cliente actualizado")
      router.push(`/clients/${client.id}`)
      router.refresh()
    })
  }

  const err = (k: string) =>
    fieldErrors[k]?.[0] ? (
      <p className="mt-1 flex items-center gap-1 text-xs text-danger">
        <AlertCircle className="h-3 w-3 flex-shrink-0" />
        {fieldErrors[k]![0]}
      </p>
    ) : null

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {/* Información básica */}
      <section className="bg-card rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Información del cliente</h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Nombre completo <span className="text-danger">*</span>
          </label>
          <input
            name="name"
            required
            defaultValue={client.name ?? ""}
            className={inputCls}
            placeholder="Ej. María Fernández"
          />
          {err("name")}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email</label>
            <input
              name="email"
              type="email"
              defaultValue={client.email ?? ""}
              className={inputCls}
              placeholder="correo@ejemplo.com"
            />
            {err("email")}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Teléfono</label>
            <input
              name="phone"
              type="tel"
              defaultValue={client.phone ?? ""}
              className={inputCls}
              placeholder="+1 809 555 0000"
            />
            {err("phone")}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            ¿Cómo nos conoció?
          </label>
          <select name="source" defaultValue={client.source ?? ""} className={inputCls}>
            <option value="">No especificado</option>
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Ubicación */}
      <section className="bg-card rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Ubicación del cliente</h2>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Dirección</label>
          <input
            name="address"
            defaultValue={client.address ?? ""}
            className={inputCls}
            placeholder="Calle y número"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Ciudad</label>
            <input name="city" defaultValue={client.city ?? ""} className={inputCls} placeholder="Ciudad" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">País</label>
            <input name="country" defaultValue={client.country ?? ""} className={inputCls} />
          </div>
        </div>
      </section>

      {/* Redes */}
      <section className="bg-card rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Redes sociales</h2>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Instagram</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
            <input
              name="instagramHandle"
              defaultValue={client.instagramHandle ?? ""}
              className={`${inputCls} pl-7`}
              placeholder="usuario"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Sitio web</label>
          <input
            name="websiteUrl"
            type="url"
            defaultValue={client.websiteUrl ?? ""}
            className={inputCls}
            placeholder="https://ejemplo.com"
          />
          {err("websiteUrl")}
        </div>
      </section>

      {/* Notas */}
      <section className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Notas internas</h2>
        <textarea
          name="notes"
          rows={3}
          defaultValue={client.notes ?? ""}
          className={`${inputCls} resize-none`}
          placeholder="Referencias, detalles del cliente, preferencias de estilo…"
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-brand-foreground text-sm font-medium rounded-lg hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        <Link
          href={`/clients/${client.id}`}
          className="px-5 py-2.5 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
