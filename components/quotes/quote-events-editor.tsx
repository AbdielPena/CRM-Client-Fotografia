"use client"

import * as React from "react"
import { Star, X } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { formatCurrency } from "@/lib/utils/currency"

/**
 * Las FECHAS de una cotización, cada una con lo suyo.
 *
 * El caso que no cabía antes: una quinceañera lleva la sesión de fotos un día
 * (con uno de los planes) y la fiesta otro día, cotizada aparte, con distinta
 * cantidad de fotos y distinto plazo de entrega. Con un solo campo "fecha de la
 * sesión" no había dónde poner la segunda.
 *
 * Con una sola fecha esto se ve como el formulario de siempre: una tarjeta.
 */

export type PackageOption = {
  id: string
  name: string
  price: number
  deliveryDays: number | null
  photoCount: number | null
  bookEnabled: boolean
}

export type EventDraft = {
  name: string
  eventDate: string
  eventTime: string
  location: string
  packageId: string
  amount: string
  isPrimary: boolean
  photoCount: string
  deliveryDays: string
  includesPrints: boolean
  includesBook: boolean
}

export function nuevoEvento(p?: PackageOption, primero = false): EventDraft {
  return {
    name: primero ? "Sesión de fotos" : "",
    eventDate: "",
    eventTime: "",
    location: "",
    packageId: p?.id ?? "",
    amount: p ? String(p.price) : "",
    isPrimary: primero,
    photoCount: p?.photoCount != null ? String(p.photoCount) : "",
    deliveryDays: p?.deliveryDays != null ? String(p.deliveryDays) : "",
    includesPrints: false,
    includesBook: p?.bookEnabled ?? false,
  }
}

/** Lo que se manda al servidor. */
export function eventosParaGuardar(eventos: EventDraft[]) {
  return eventos
    .filter((e) => e.eventDate.trim() !== "")
    .map((e) => ({
      name: e.name.trim() || "Evento",
      eventDate: e.eventDate,
      eventTime: e.eventTime || null,
      location: e.location.trim() || null,
      packageId: e.packageId || null,
      amount: e.amount === "" ? null : Number(e.amount),
      isPrimary: e.isPrimary,
      photoCount: e.photoCount === "" ? null : Number(e.photoCount),
      deliveryDays: e.deliveryDays === "" ? null : Number(e.deliveryDays),
      includesPrints: e.includesPrints,
      includesBook: e.includesBook,
    }))
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
const labelCls = "mb-1 block text-[11px] font-medium text-muted-foreground"

export function QuoteEventsEditor({
  eventos,
  setEventos,
  packages,
  currency,
}: {
  eventos: EventDraft[]
  setEventos: React.Dispatch<React.SetStateAction<EventDraft[]>>
  packages: PackageOption[]
  currency: string
}) {
  const set = (i: number, patch: Partial<EventDraft>) =>
    setEventos((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)))

  // Al elegir un plan se traen sus valores: fotos, plazo, precio y Book. Se
  // pueden pisar a mano — el plan es el punto de partida, no una jaula.
  const elegirPlan = (i: number, id: string) => {
    const p = packages.find((x) => x.id === id)
    set(i, {
      packageId: id,
      ...(p
        ? {
            amount: String(p.price),
            photoCount: p.photoCount != null ? String(p.photoCount) : "",
            deliveryDays: p.deliveryDays != null ? String(p.deliveryDays) : "",
            includesBook: p.bookEnabled,
          }
        : {}),
    })
  }

  const marcarPrincipal = (i: number) =>
    setEventos((prev) => prev.map((e, j) => ({ ...e, isPrimary: j === i })))

  const quitar = (i: number) =>
    setEventos((prev) => {
      if (prev.length === 1) return prev
      const resto = prev.filter((_, j) => j !== i)
      // Si se borró el principal, manda el primero que quede.
      if (!resto.some((e) => e.isPrimary)) resto[0]!.isPrimary = true
      return resto
    })

  const total = eventos.reduce((t, e) => t + (Number(e.amount) || 0), 0)
  const varios = eventos.length > 1

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-foreground">
          {varios ? "Fechas del trabajo" : "La sesión"}
        </label>
        {varios && (
          <span className="text-[11px] text-muted-foreground">
            Suma:{" "}
            <strong className="text-foreground">
              {formatCurrency(total, currency)}
            </strong>
          </span>
        )}
      </div>

      {eventos.map((e, i) => (
        <div
          key={i}
          className={cn(
            "rounded-lg border p-3",
            varios && e.isPrimary
              ? "border-brand/50 bg-brand/[0.03]"
              : "border-border bg-muted/20",
          )}
        >
          {varios && (
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => marcarPrincipal(i)}
                title="La fecha principal es la que manda en el tablero, los recordatorios y los avisos"
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  e.isPrimary
                    ? "bg-brand/15 text-brand"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Star
                  className={cn("h-3 w-3", e.isPrimary && "fill-current")}
                />
                {e.isPrimary ? "Fecha principal" : "Hacer principal"}
              </button>
              <button
                type="button"
                onClick={() => quitar(i)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                title="Quitar este evento"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="col-span-2">
              <label className={labelCls}>Qué es</label>
              <input
                value={e.name}
                onChange={(ev) => set(i, { name: ev.target.value })}
                className={inputCls}
                placeholder="Sesión de fotos, Fiesta…"
              />
            </div>
            <div>
              <label className={labelCls}>Fecha *</label>
              <input
                value={e.eventDate}
                onChange={(ev) => set(i, { eventDate: ev.target.value })}
                type="date"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Hora</label>
              <input
                value={e.eventTime}
                onChange={(ev) => set(i, { eventTime: ev.target.value })}
                type="time"
                className={inputCls}
              />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Plan</label>
              <select
                value={e.packageId}
                onChange={(ev) => elegirPlan(i, ev.target.value)}
                className={inputCls}
              >
                <option value="">Sin plan — cotizado aparte</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatCurrency(p.price, currency)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Precio de este evento</label>
              <input
                value={e.amount}
                onChange={(ev) => set(i, { amount: ev.target.value })}
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="mt-2">
            <label className={labelCls}>Lugar</label>
            <input
              value={e.location}
              onChange={(ev) => set(i, { location: ev.target.value })}
              className={inputCls}
              placeholder="Estudio, salón, playa…"
            />
          </div>

          {/* Lo que entrega ESTE evento. La fiesta y la sesión de fotos no
              entregan lo mismo ni en el mismo plazo. */}
          <div className="mt-3 border-t border-border/60 pt-2">
            <p className={labelCls}>Qué entrega este evento</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Fotos editadas</label>
                <input
                  value={e.photoCount}
                  onChange={(ev) => set(i, { photoCount: ev.target.value })}
                  type="number"
                  min="0"
                  className={inputCls}
                  placeholder="Ej: 200"
                />
              </div>
              <div>
                <label className={labelCls}>Entrega en (días)</label>
                <input
                  value={e.deliveryDays}
                  onChange={(ev) => set(i, { deliveryDays: ev.target.value })}
                  type="number"
                  min="0"
                  className={inputCls}
                  placeholder="Ej: 21"
                />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={e.includesPrints}
                  onChange={(ev) => set(i, { includesPrints: ev.target.checked })}
                  className="h-3.5 w-3.5 accent-brand"
                />
                Lleva impresiones
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={e.includesBook}
                  onChange={(ev) => set(i, { includesBook: ev.target.checked })}
                  className="h-3.5 w-3.5 accent-brand"
                />
                Lleva Book Experience
              </label>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setEventos((prev) => [...prev, nuevoEvento()])}
        className="text-xs font-medium text-primary hover:opacity-80"
      >
        + Agregar otra fecha (la fiesta, una segunda sesión…)
      </button>
      {!varios && (
        <p className="text-[11px] text-muted-foreground">
          Si el trabajo lleva más de un día —la fiesta va aparte de la sesión de
          fotos— agrégalo aquí: cada fecha se agenda sola y lleva su propio
          plazo de entrega.
        </p>
      )}
    </div>
  )
}
