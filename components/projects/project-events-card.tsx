"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils/cn"
import { formatCurrency } from "@/lib/utils/currency"
import {
  addProjectEventAction,
  deleteProjectEventAction,
  setPrimaryProjectEventAction,
  updateProjectEventAction,
} from "@/server/actions/project.actions"

/**
 * Las FECHAS de esta sesión.
 *
 * Una quinceañera puede llevar la sesión de fotos un día y la fiesta otro. Son
 * la MISMA sesión —un contrato, una factura— pero cada fecha se agenda por su
 * cuenta y entrega lo suyo, en su propio plazo.
 *
 * La fecha PRINCIPAL es la que manda en el tablero, en el recordatorio de saldo
 * y en el aviso de "sesión realizada".
 */

export type ProjectEventView = {
  id: string
  name: string
  eventDate: string
  eventTime: string | null
  eventEndTime: string | null
  location: string | null
  packageName: string | null
  amount: number | null
  isPrimary: boolean
  photoCount: number | null
  deliveryDays: number | null
  includesPrints: boolean
  includesBook: boolean
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-brand"
const labelCls = "mb-0.5 block text-[10px] font-medium text-muted-foreground"

/** `2026-11-06` → `jue 06 nov 2026`, sin correrse un día en RD (UTC−4). */
function fechaCorta(dateOnly: string) {
  if (!dateOnly) return ""
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateOnly.slice(0, 10)}T00:00:00Z`))
}

function incluye(e: ProjectEventView): string[] {
  const p: string[] = []
  if (e.photoCount != null && e.photoCount > 0) p.push(`${e.photoCount} fotos`)
  if (e.deliveryDays != null)
    p.push(e.deliveryDays === 0 ? "entrega el mismo día" : `${e.deliveryDays} días`)
  if (e.includesPrints) p.push("impresiones")
  if (e.includesBook) p.push("Book Experience")
  return p
}

export function ProjectEventsCard({
  projectId,
  events,
  currency = "DOP",
}: {
  projectId: string
  events: ProjectEventView[]
  currency?: string
}) {
  const router = useRouter()
  const [editando, setEditando] = React.useState<string | null>(null)
  const [agregando, setAgregando] = React.useState(false)
  const [ocupado, setOcupado] = React.useState(false)

  const correr = async (fn: () => Promise<{ error?: string }>, ok: string) => {
    setOcupado(true)
    try {
      const r = await fn()
      if (r?.error) {
        toast.error(r.error)
        return false
      }
      toast.success(ok)
      setEditando(null)
      setAgregando(false)
      router.refresh()
      return true
    } finally {
      setOcupado(false)
    }
  }

  const varias = events.length > 1

  return (
    <div className="space-y-2">
      {varias && (
        <p className="rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
          Es UNA sola sesión con {events.length} fechas: un contrato y una
          factura por el total. La fecha principal es la que manda en el tablero
          y en los recordatorios.
        </p>
      )}

      {events.map((e) => (
        <div
          key={e.id}
          className={cn(
            "rounded-lg border p-2.5",
            varias && e.isPrimary
              ? "border-brand/40 bg-brand/[0.03]"
              : "border-border/60",
          )}
        >
          {editando === e.id ? (
            <EventoForm
              projectId={projectId}
              evento={e}
              ocupado={ocupado}
              onCancel={() => setEditando(null)}
              onSubmit={(fd) =>
                correr(
                  () => updateProjectEventAction(fd),
                  "Fecha actualizada",
                )
              }
            />
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-xs font-semibold text-foreground">
                      {e.name}
                    </p>
                    {varias && e.isPrimary && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[9px] font-semibold text-brand">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        Principal
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {fechaCorta(e.eventDate)}
                      {e.eventTime ? ` · ${e.eventTime}` : ""}
                    </span>
                    {e.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {e.location}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {varias && !e.isPrimary && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => {
                        const fd = new FormData()
                        fd.set("eventId", e.id)
                        fd.set("projectId", projectId)
                        void correr(
                          () => setPrimaryProjectEventAction(fd),
                          "Ahora esta es la fecha principal",
                        )
                      }}
                      title="Hacer principal"
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditando(e.id)}
                    title="Editar"
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {varias && !e.isPrimary && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => {
                        if (
                          !confirm(
                            `¿Quitar "${e.name}" de esta sesión? La fecha deja de estar agendada.`,
                          )
                        )
                          return
                        const fd = new FormData()
                        fd.set("eventId", e.id)
                        fd.set("projectId", projectId)
                        void correr(
                          () => deleteProjectEventAction(fd),
                          "Fecha quitada",
                        )
                      }}
                      title="Quitar"
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-muted-foreground">
                  {e.packageName ?? "Cotizado aparte"}
                  {incluye(e).length > 0 ? ` · ${incluye(e).join(" · ")}` : ""}
                </span>
                {e.amount != null && e.amount > 0 && (
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatCurrency(e.amount, currency)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      ))}

      {agregando ? (
        <div className="rounded-lg border border-dashed border-border p-2.5">
          <EventoForm
            projectId={projectId}
            ocupado={ocupado}
            onCancel={() => setAgregando(false)}
            onSubmit={(fd) =>
              correr(() => addProjectEventAction(fd), "Fecha agregada")
            }
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAgregando(true)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:opacity-80"
        >
          <Plus className="h-3 w-3" /> Agregar otra fecha
        </button>
      )}
    </div>
  )
}

function EventoForm({
  projectId,
  evento,
  ocupado,
  onCancel,
  onSubmit,
}: {
  projectId: string
  evento?: ProjectEventView
  ocupado: boolean
  onCancel: () => void
  onSubmit: (fd: FormData) => void | Promise<unknown>
}) {
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault()
        const fd = new FormData(ev.currentTarget)
        fd.set("projectId", projectId)
        if (evento) fd.set("eventId", evento.id)
        void onSubmit(fd)
      }}
      className="space-y-2"
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className={labelCls}>Qué es</label>
          <input
            name="name"
            defaultValue={evento?.name ?? ""}
            className={inputCls}
            placeholder="Sesión de fotos, Fiesta…"
          />
        </div>
        <div>
          <label className={labelCls}>Fecha *</label>
          <input
            name="eventDate"
            type="date"
            defaultValue={evento?.eventDate ?? ""}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Hora</label>
          <input
            name="eventTime"
            type="time"
            defaultValue={evento?.eventTime ?? ""}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>Lugar</label>
        <input
          name="location"
          defaultValue={evento?.location ?? ""}
          className={inputCls}
          placeholder="Estudio, salón, playa…"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Fotos editadas</label>
          <input
            name="photoCount"
            type="number"
            min="0"
            defaultValue={evento?.photoCount ?? ""}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Entrega en (días)</label>
          <input
            name="deliveryDays"
            type="number"
            min="0"
            defaultValue={evento?.deliveryDays ?? ""}
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="inline-flex items-center gap-1.5 text-[11px] text-foreground">
          <input
            type="checkbox"
            name="includesPrints"
            defaultChecked={evento?.includesPrints ?? false}
            className="h-3.5 w-3.5 accent-brand"
          />
          Lleva impresiones
        </label>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-foreground">
          <input
            type="checkbox"
            name="includesBook"
            defaultChecked={evento?.includesBook ?? false}
            className="h-3.5 w-3.5 accent-brand"
          />
          Lleva Book Experience
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={ocupado}
          className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {ocupado ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  )
}
