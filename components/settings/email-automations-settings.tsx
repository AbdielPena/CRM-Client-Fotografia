"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2, Mail, PauseCircle } from "lucide-react"

import {
  AUTOMATIONS,
  FIELD_LABELS,
  FIELD_SUFFIX,
  describeAutomation,
  type AutomationConfig,
  type AutomationDef,
  type AutomationField,
  type AutomationKey,
} from "@/lib/email/automations"
import { updateAutomationAction } from "@/server/actions/email-automation.actions"
import { cn } from "@/lib/utils/cn"

/**
 * Ritmo de cada correo automático.
 *
 * Cada tarjeta se guarda por su cuenta: son ajustes independientes y un fallo
 * en uno no debe hacer perder lo que se escribió en otro.
 */

export type AutomationsInitial = Record<AutomationKey, AutomationConfig>

export function EmailAutomationsSettings({
  initial,
  pausedClients,
}: {
  initial: AutomationsInitial
  pausedClients: Array<{ id: string; name: string }>
}) {
  return (
    <div className="space-y-4">
      {AUTOMATIONS.map((def) => (
        <AutomationCard key={def.key} def={def} initial={initial[def.key]} />
      ))}

      <PausedClientsCard clients={pausedClients} />

      <p className="text-xs text-muted-foreground">
        Los correos que salen de una acción tuya —mandar la factura, publicar la
        galería, enviar el contrato— no aparecen aquí porque no se repiten: salen
        una vez, cuando tú lo haces. Para frenarle esos a alguien en concreto,
        usa la pausa desde la ficha del cliente.
      </p>
    </div>
  )
}

function AutomationCard({
  def,
  initial,
}: {
  def: AutomationDef
  initial: AutomationConfig
}) {
  const [cfg, setCfg] = React.useState<AutomationConfig>(initial)
  const [guardando, setGuardando] = React.useState(false)
  const [sucio, setSucio] = React.useState(false)

  const set = (patch: Partial<AutomationConfig>) => {
    setCfg((prev) => ({ ...prev, ...patch }))
    setSucio(true)
  }

  async function guardar() {
    setGuardando(true)
    try {
      const fd = new FormData()
      fd.set("key", def.key)
      fd.set("enabled", String(cfg.enabled))
      for (const f of def.fields) {
        const v = cfg[f]
        if (v != null) fd.set(f, String(v))
      }
      const res = await updateAutomationAction(fd)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${def.label} actualizado`)
      setSucio(false)
    } catch {
      toast.error("No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="sf-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-brand" />
            <h3 className="font-semibold text-foreground">{def.label}</h3>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{def.what}</p>
          <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <div>
              <dt className="inline font-medium">Empieza:</dt>{" "}
              <dd className="inline">{def.when}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Se detiene solo:</dt>{" "}
              <dd className="inline">{def.stops}</dd>
            </div>
          </dl>
        </div>

        <Switch
          checked={cfg.enabled}
          onChange={(v) => set({ enabled: v })}
          label={def.label}
        />
      </div>

      <div
        className={cn(
          "mt-4 rounded-xl border border-border/60 bg-muted/20 p-4 transition-opacity",
          !cfg.enabled && "pointer-events-none opacity-45",
        )}
      >
        <p className="mb-3 text-sm font-medium text-foreground">
          {describeAutomation(def, cfg)}
        </p>

        <div className="flex flex-wrap items-end gap-4">
          {def.fields.map((f) => (
            <NumberField
              key={f}
              id={`${def.key}-${f}`}
              label={FIELD_LABELS[f]}
              suffix={FIELD_SUFFIX[f]}
              value={cfg[f]}
              min={f === "offset_days" ? 0 : 1}
              max={f === "max_days" ? 365 : 90}
              onChange={(n) => set({ [f]: n } as Partial<AutomationConfig>)}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || !sucio}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-40"
        >
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {sucio ? "Guardar cambios" : "Guardado"}
        </button>
      </div>
    </div>
  )
}

function PausedClientsCard({
  clients,
}: {
  clients: Array<{ id: string; name: string }>
}) {
  return (
    <div className="sf-card p-5">
      <div className="flex items-center gap-2">
        <PauseCircle className="h-4 w-4 text-amber-500" />
        <h3 className="font-semibold text-foreground">Clientes en pausa</h3>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        A estas personas no les sale <strong>ningún</strong> correo del sistema
        —ni recordatorios ni facturas ni galerías— hasta que las reanudes.
      </p>

      {clients.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border bg-background/40 px-3 py-3 text-center text-xs text-muted-foreground">
          Ninguno en pausa. Todos reciben sus correos con normalidad.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {clients.map((c) => (
            <li key={c.id}>
              <a
                href={`/clients/${c.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
              >
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── piezas ──────────────────────────────────────────────────────────────────

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${checked ? "Apagar" : "Encender"} ${label}`}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        checked ? "bg-brand" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
          checked ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  )
}

function NumberField({
  id,
  label,
  suffix,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  suffix: string
  value: number | null
  min: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-[11px] font-medium text-muted-foreground"
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value)
            // Se ignoran valores fuera de rango en vez de guardarlos: el CHECK
            // de la tabla los rechazaría y el error saldría al guardar, lejos
            // del campo que lo causó.
            if (Number.isInteger(n) && n >= min && n <= max) onChange(n)
          }}
          className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-center text-sm tabular-nums text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
    </div>
  )
}
