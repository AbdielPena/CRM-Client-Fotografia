"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  GripVertical,
  Lock,
  Plus,
  Save,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import {
  BOOKING_BUILTINS,
  BOOKING_DEFAULTS,
  resolveBuiltins,
  type BookingBuiltinKey,
  type BookingCustomField,
  type BookingCustomFieldType,
  type BookingFormConfig,
} from "@/lib/forms/booking-form"
import { saveBookingFormConfigAction } from "@/server/actions/booking-form.actions"
import { cn } from "@/lib/utils/cn"

const TYPE_LABELS: Record<BookingCustomFieldType, string> = {
  text: "Texto corto",
  textarea: "Texto largo",
  select: "Lista desplegable",
  radio: "Opción única",
  checkboxes: "Casillas (varias)",
  number: "Número",
  date: "Fecha",
  tel: "Teléfono",
  email: "Email",
}

const HAS_OPTIONS = (t: BookingCustomFieldType) =>
  t === "select" || t === "radio" || t === "checkboxes"

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"

type BuiltinState = { enabled: boolean; required: boolean; label: string }

function newKey(): string {
  // Clave estable para la pregunta (se usa como name en el form + metadata).
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 8)
      : Math.floor(Math.random() * 1e9).toString(16)
  return `q_${rnd}`
}

export function BookingFormEditor({
  initialConfig,
  previewUrl,
}: {
  initialConfig: BookingFormConfig
  previewUrl: string | null
}) {
  const router = useRouter()
  const [saving, startSave] = React.useTransition()

  const resolved = React.useMemo(() => resolveBuiltins(initialConfig), [initialConfig])

  const [introText, setIntroText] = React.useState(initialConfig.introText ?? "")
  const [consentText, setConsentText] = React.useState(initialConfig.consentText ?? "")
  const [submitLabel, setSubmitLabel] = React.useState(initialConfig.submitLabel ?? "")

  const [builtins, setBuiltins] = React.useState<Record<BookingBuiltinKey, BuiltinState>>(() => {
    const out = {} as Record<BookingBuiltinKey, BuiltinState>
    for (const r of resolved) out[r.key] = { enabled: r.enabled, required: r.required, label: r.label }
    return out
  })

  const [custom, setCustom] = React.useState<BookingCustomField[]>(
    () => initialConfig.customFields ?? [],
  )

  const patchBuiltin = (key: BookingBuiltinKey, patch: Partial<BuiltinState>) =>
    setBuiltins((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const patchCustom = (i: number, patch: Partial<BookingCustomField>) =>
    setCustom((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))

  const addCustom = () =>
    setCustom((prev) => [
      ...prev,
      { key: newKey(), label: "", type: "text", required: false },
    ])

  const removeCustom = (i: number) => setCustom((prev) => prev.filter((_, idx) => idx !== i))

  const moveCustom = (i: number, dir: -1 | 1) =>
    setCustom((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })

  const onSave = () => {
    // Validación mínima en cliente antes de mandar.
    for (const f of custom) {
      if (!f.label.trim()) {
        toast.error("Hay una pregunta propia sin título.")
        return
      }
      if (HAS_OPTIONS(f.type) && (!f.options || f.options.filter((o) => o.trim()).length === 0)) {
        toast.error(`La pregunta "${f.label}" necesita al menos una opción.`)
        return
      }
    }

    const config: BookingFormConfig = {
      introText: introText.trim() || undefined,
      consentText: consentText.trim() || undefined,
      submitLabel: submitLabel.trim() || undefined,
      builtins: Object.fromEntries(
        BOOKING_BUILTINS.map((b) => {
          const s = builtins[b.key]
          return [b.key, { enabled: s.enabled, required: s.required, label: s.label.trim() || undefined }]
        }),
      ) as BookingFormConfig["builtins"],
      customFields: custom.map((f) => ({
        ...f,
        label: f.label.trim(),
        options: HAS_OPTIONS(f.type)
          ? (f.options ?? []).map((o) => o.trim()).filter(Boolean)
          : undefined,
      })),
    }

    startSave(async () => {
      const r = await saveBookingFormConfigAction(config)
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar")
        return
      }
      toast.success("Formulario de reserva guardado")
      router.refresh()
    })
  }

  const clientFields = resolved.filter((r) => r.group === "client")
  const eventFields = resolved.filter((r) => r.group === "event")

  return (
    <div className="max-w-3xl space-y-6">
      {previewUrl && (
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Ver el formulario público
        </a>
      )}

      {/* Campos fijos */}
      <section className="sf-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Campos del formulario</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Muestra u oculta, renombra y marca obligatorios los campos. Los que
          tienen candado son necesarios para crear la solicitud.
        </p>

        <FieldGroup title="Tus datos">
          {clientFields.map((r) => (
            <BuiltinRow
              key={r.key}
              def={r}
              state={builtins[r.key]}
              onChange={(patch) => patchBuiltin(r.key, patch)}
            />
          ))}
        </FieldGroup>
        <FieldGroup title="Detalles del evento">
          {eventFields.map((r) => (
            <BuiltinRow
              key={r.key}
              def={r}
              state={builtins[r.key]}
              onChange={(patch) => patchBuiltin(r.key, patch)}
            />
          ))}
        </FieldGroup>
      </section>

      {/* Preguntas propias */}
      <section className="sf-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Preguntas propias</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Agrega las preguntas que necesites (nombre de la quinceañera, color
              del vestido, presupuesto…). Aparecen al final del formulario.
            </p>
          </div>
          <button
            type="button"
            onClick={addCustom}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand hover:text-brand"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>

        {custom.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
            Sin preguntas propias. Toca "Agregar" para crear la primera.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {custom.map((f, i) => (
              <CustomFieldRow
                key={f.key}
                field={f}
                index={i}
                total={custom.length}
                onChange={(patch) => patchCustom(i, patch)}
                onRemove={() => removeCustom(i)}
                onMove={(dir) => moveCustom(i, dir)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Textos */}
      <section className="sf-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Textos</h2>
        <div className="mt-3 space-y-4">
          <Labeled label="Texto de introducción" hint={`Por defecto: "${BOOKING_DEFAULTS.introText.slice(0, 60)}…"`}>
            <textarea
              rows={2}
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              placeholder={BOOKING_DEFAULTS.introText}
              className={cn(inputCls, "resize-none")}
            />
          </Labeled>
          <Labeled label="Texto del consentimiento (checkbox)">
            <textarea
              rows={2}
              value={consentText}
              onChange={(e) => setConsentText(e.target.value)}
              placeholder={BOOKING_DEFAULTS.consentText}
              className={cn(inputCls, "resize-none")}
            />
          </Labeled>
          <Labeled label="Texto del botón de envío">
            <input
              value={submitLabel}
              onChange={(e) => setSubmitLabel(e.target.value)}
              placeholder={BOOKING_DEFAULTS.submitLabel}
              className={inputCls}
            />
          </Labeled>
        </div>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-lg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  )
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border">
        {children}
      </div>
    </div>
  )
}

function BuiltinRow({
  def,
  state,
  onChange,
}: {
  def: { key: BookingBuiltinKey; label: string; locked?: boolean }
  state: BuiltinState
  onChange: (patch: Partial<BuiltinState>) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-card px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {def.locked ? (
          <Lock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        ) : (
          <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40" />
        )}
        <input
          value={state.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-foreground hover:border-border focus:border-brand focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-4 text-xs">
        <Toggle
          label="Mostrar"
          checked={state.enabled}
          disabled={def.locked}
          onChange={(v) => onChange({ enabled: v, required: v ? state.required : false })}
        />
        <Toggle
          label="Obligatorio"
          checked={state.required}
          disabled={def.locked || !state.enabled}
          onChange={(v) => onChange({ required: v })}
        />
      </div>
    </div>
  )
}

function CustomFieldRow({
  field,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  field: BookingCustomField
  index: number
  total: number
  onChange: (patch: Partial<BookingCustomField>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <input
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Título de la pregunta (ej: Nombre de la quinceañera)"
            className={cn(inputCls, "flex-1")}
          />
          <select
            value={field.type}
            onChange={(e) => onChange({ type: e.target.value as BookingCustomFieldType })}
            className={cn(inputCls, "sm:w-48")}
          >
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
            aria-label="Subir"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
            aria-label="Bajar"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
            aria-label="Eliminar pregunta"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          value={field.placeholder ?? ""}
          onChange={(e) => onChange({ placeholder: e.target.value })}
          placeholder="Texto de ayuda dentro del campo (opcional)"
          className={cn(inputCls, "flex-1 !py-1.5 text-xs")}
        />
        <Toggle
          label="Obligatorio"
          checked={!!field.required}
          onChange={(v) => onChange({ required: v })}
        />
      </div>

      {HAS_OPTIONS(field.type) && (
        <div className="mt-2">
          <p className="mb-1 text-[11px] text-muted-foreground">Opciones (una por línea)</p>
          <textarea
            rows={3}
            value={(field.options ?? []).join("\n")}
            onChange={(e) => onChange({ options: e.target.value.split("\n") })}
            placeholder={"Opción 1\nOpción 2\nOpción 3"}
            className={cn(inputCls, "resize-none text-xs")}
          />
        </div>
      )}
    </div>
  )
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer select-none items-center gap-1.5",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-border text-brand focus:ring-brand/30"
      />
      <span className="text-muted-foreground">{label}</span>
    </label>
  )
}

function Labeled({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}
