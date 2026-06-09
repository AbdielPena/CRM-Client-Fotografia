"use client"

import { useState, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  Cake,
  HeartHandshake,
  Star,
  Save,
  GripVertical,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { createCustomEngagementAutomationAction } from "@/server/actions/engagement.actions"
import { draftEngagementMessageAction } from "@/server/actions/engagement-ai.actions"

type TriggerType = "date_birthday" | "date_inactivity" | "date_final_delivery"

interface Block {
  id: number
  type: string
  config: Record<string, unknown>
}

const BLOCK_TYPES = [
  { type: "wait", label: "Esperar", emoji: "⏳" },
  { type: "send_email", label: "Enviar email", emoji: "✉️" },
  { type: "send_whatsapp", label: "Enviar WhatsApp", emoji: "📲" },
  { type: "request_review", label: "Pedir reseña", emoji: "⭐" },
  { type: "create_task", label: "Crear tarea", emoji: "✅" },
  { type: "add_tag", label: "Aplicar etiqueta", emoji: "🏷️" },
  { type: "notify", label: "Notificarme", emoji: "🔔" },
]

const EMAIL_TEMPLATES = [
  { slug: "engagement_birthday_greeting", label: "Cumpleaños — felicitación" },
  { slug: "engagement_birthday_soon", label: "Cumpleaños — antes" },
  { slug: "engagement_post_delivery", label: "Post-entrega / feedback" },
  { slug: "engagement_reengagement", label: "Reactivación" },
  { slug: "engagement_review_request", label: "Solicitud de reseña" },
  { slug: "engagement_generic", label: "Genérico" },
]

const TRIGGERS: Array<{ type: TriggerType; label: string; icon: typeof Cake }> = [
  { type: "date_birthday", label: "Cumpleaños del cliente", icon: Cake },
  { type: "date_inactivity", label: "Inactividad (sin reservar)", icon: HeartHandshake },
  { type: "date_final_delivery", label: "Al publicar la entrega final", icon: Star },
]

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-brand focus:outline-none"

export function FlowBuilder() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const idRef = useRef(1)

  const [name, setName] = useState("")
  const [triggerType, setTriggerType] = useState<TriggerType>("date_birthday")
  const [offsetDays, setOffsetDays] = useState(0)
  const [offsetDir, setOffsetDir] = useState("on")
  const [inactiveMonths, setInactiveMonths] = useState(6)
  const [blocks, setBlocks] = useState<Block[]>([
    { id: 0, type: "send_email", config: { template_slug: "engagement_generic" } },
  ])

  const addBlock = (type: string) => {
    const defaults: Record<string, Record<string, unknown>> = {
      wait: { wait_days: 3 },
      send_email: { template_slug: "engagement_generic" },
      send_whatsapp: { template_name: "", lang_code: "es", body_vars: ["{{client_name}}"] },
      request_review: {},
      create_task: { title: "Seguir con {{client_name}}", due_days: 2, priority: "medium" },
      add_tag: { tag: "" },
      notify: { title: "Recordatorio de {{client_name}}" },
    }
    setBlocks((b) => [...b, { id: idRef.current++, type, config: defaults[type] ?? {} }])
  }

  const updateBlock = (id: number, patch: Record<string, unknown>) =>
    setBlocks((b) => b.map((x) => (x.id === id ? { ...x, config: { ...x.config, ...patch } } : x)))

  const removeBlock = (id: number) => setBlocks((b) => b.filter((x) => x.id !== id))

  const move = (i: number, dir: -1 | 1) =>
    setBlocks((b) => {
      const j = i + dir
      if (j < 0 || j >= b.length) return b
      const copy = [...b]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  const save = () => {
    if (!name.trim()) return toast.error("Ponle un nombre")
    if (!blocks.length) return toast.error("Agrega al menos un bloque")
    const triggerConfig: Record<string, unknown> =
      triggerType === "date_birthday"
        ? { offset_days: offsetDays, offset_dir: offsetDir, birthday_repeat_yearly: true }
        : triggerType === "date_inactivity"
          ? { inactivity_months: inactiveMonths }
          : {}
    start(async () => {
      const r = await createCustomEngagementAutomationAction({
        name,
        triggerType,
        triggerConfig,
        steps: blocks.map((b) => ({ block_type: b.type, config: b.config })),
      })
      if (r.ok) {
        toast.success("Automatización creada")
        router.push("/engagement")
      } else {
        toast.error(r.message ?? "Error")
      }
    })
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Nombre */}
      <div className="rounded-xl border border-border bg-card p-5">
        <label className="mb-1.5 block text-sm font-medium text-foreground">Nombre</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Secuencia de bienvenida post-boda"
          className={inputCls}
        />
      </div>

      {/* Trigger */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Cuándo se dispara</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TRIGGERS.map((t) => {
            const Icon = t.icon
            const active = triggerType === t.type
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => setTriggerType(t.type)}
                className={`flex items-center gap-2 rounded-lg border p-3 text-left text-[12.5px] transition-colors ${
                  active ? "border-brand bg-brand/5 text-foreground" : "border-border text-muted-foreground hover:border-border-strong"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t.label}
              </button>
            )
          })}
        </div>
        {triggerType === "date_birthday" && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            Enviar
            <input
              type="number"
              min={0}
              value={offsetDays}
              onChange={(e) => setOffsetDays(Number(e.target.value))}
              className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center"
            />
            días
            <select value={offsetDir} onChange={(e) => setOffsetDir(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5">
              <option value="before">antes</option>
              <option value="on">el día (0)</option>
              <option value="after">después</option>
            </select>
            del cumpleaños.
          </div>
        )}
        {triggerType === "date_inactivity" && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            Cliente sin reservar hace
            <input
              type="number"
              min={1}
              value={inactiveMonths}
              onChange={(e) => setInactiveMonths(Number(e.target.value))}
              className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center"
            />
            meses.
          </div>
        )}
      </div>

      {/* Blocks */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Pasos del flujo</h2>
        {blocks.map((b, i) => {
          const meta = BLOCK_TYPES.find((x) => x.type === b.type)
          return (
            <div key={b.id} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                <span className="text-base">{meta?.emoji}</span>
                <span className="text-[13px] font-semibold text-foreground">{meta?.label}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => removeBlock(b.id)} className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <BlockConfig block={b} update={(p) => updateBlock(b.id, p)} />
            </div>
          )
        })}

        {/* Add block */}
        <div className="flex flex-wrap gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-3">
          {BLOCK_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => addBlock(t.type)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-brand"
            >
              <Plus className="h-3.5 w-3.5" /> {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Crear automatización
        </button>
        <button type="button" onClick={() => router.push("/engagement")} className="rounded-lg bg-muted/60 px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function BlockConfig({ block, update }: { block: Block; update: (p: Record<string, unknown>) => void }) {
  const c = block.config
  if (block.type === "wait") {
    return (
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        Esperar
        <input type="number" min={0} value={Number(c.wait_days ?? 0)} onChange={(e) => update({ wait_days: Number(e.target.value) })} className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center" />
        días antes del siguiente paso.
      </div>
    )
  }
  if (block.type === "send_email") {
    return <SendEmailConfig c={c} update={update} />
  }
  if (block.type === "send_whatsapp") {
    return <SendWhatsAppConfig c={c} update={update} />
  }
  if (block.type === "request_review") {
    return <p className="text-[12px] text-muted-foreground">Envía la solicitud de reseña con tu link de feedback ({"{{review_link}}"}). El cliente con 4★+ va a Google/Facebook.</p>
  }
  if (block.type === "create_task") {
    return (
      <div className="space-y-2">
        <input value={String(c.title ?? "")} onChange={(e) => update({ title: e.target.value })} placeholder="Título de la tarea (admite {{client_name}})" className={inputCls} />
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          Vence en
          <input type="number" min={0} value={Number(c.due_days ?? 0)} onChange={(e) => update({ due_days: Number(e.target.value) })} className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center" />
          días ·
          <select value={String(c.priority ?? "medium")} onChange={(e) => update({ priority: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-1.5">
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
      </div>
    )
  }
  if (block.type === "add_tag") {
    return <input value={String(c.tag ?? "")} onChange={(e) => update({ tag: e.target.value })} placeholder="Nombre de la etiqueta (ej. VIP, Cumpleañero)" className={inputCls} />
  }
  if (block.type === "notify") {
    return <input value={String(c.title ?? "")} onChange={(e) => update({ title: e.target.value })} placeholder="Texto de la notificación interna" className={inputCls} />
  }
  return null
}

function SendWhatsAppConfig({
  c,
  update,
}: {
  c: Record<string, unknown>
  update: (p: Record<string, unknown>) => void
}) {
  const [drafting, startDraft] = useTransition()
  const [draft, setDraft] = useState<string | null>(null)
  const [brief, setBrief] = useState("")

  const doDraft = () => {
    if (!brief.trim()) {
      toast.error("Escribe de qué trata el mensaje")
      return
    }
    startDraft(async () => {
      const r = await draftEngagementMessageAction({
        channel: "whatsapp",
        brief,
        clientName: "María (ejemplo)",
      })
      if (r.ok) setDraft(r.body)
      else toast.error(r.error)
    })
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-[12px] text-muted-foreground">
          Nombre de la plantilla aprobada en Meta
        </label>
        <input
          value={String(c.template_name ?? "")}
          onChange={(e) => update({ template_name: e.target.value })}
          placeholder="ej. cumpleanos_cliente"
          className={inputCls}
        />
      </div>
      <div className="w-32">
        <label className="mb-1 block text-[12px] text-muted-foreground">Idioma</label>
        <input
          value={String(c.lang_code ?? "es")}
          onChange={(e) => update({ lang_code: e.target.value })}
          placeholder="es"
          className={inputCls}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        El primer dato <code>{"{{1}}"}</code> de la plantilla se llena con el nombre del cliente. La plantilla debe estar <strong>aprobada en Meta</strong> (WhatsApp Manager → Plantillas) y enviarse desde un número de producción.
      </p>

      <div className="space-y-2 rounded-lg border border-emerald-400/40 bg-emerald-50/50 p-3 dark:bg-emerald-950/20">
        <label className="flex items-center gap-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
          <Sparkles className="h-3.5 w-3.5" /> ¿No tienes la plantilla? Redáctala con IA
        </label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={2}
          placeholder="Ej: Felicitar el cumpleaños y ofrecer 15% en su próxima sesión."
          className={inputCls}
        />
        <button
          type="button"
          onClick={doDraft}
          disabled={drafting}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500 bg-card px-2.5 py-1.5 text-[12px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
        >
          {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Redactar plantilla
        </button>
        {draft && (
          <div className="rounded-lg border border-border bg-background p-2.5 text-[12px] text-foreground">
            <p className="whitespace-pre-wrap">{draft}</p>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Copia este texto y créalo como plantilla en Meta. Cambia el nombre por <code>{"{{1}}"}</code> donde quieras que vaya el nombre del cliente.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function SendEmailConfig({
  c,
  update,
}: {
  c: Record<string, unknown>
  update: (p: Record<string, unknown>) => void
}) {
  const aiOn = !!c.ai_enabled
  const [previewing, startPreview] = useTransition()
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null)

  const doPreview = () => {
    const brief = String(c.ai_brief ?? "").trim()
    if (!brief) {
      toast.error("Escribe de qué trata el mensaje")
      return
    }
    startPreview(async () => {
      const r = await draftEngagementMessageAction({
        channel: "email",
        brief,
        clientName: "María (ejemplo)",
        tone: (c.ai_tone as string) ?? null,
      })
      if (r.ok) setPreview({ subject: r.subject, body: r.body })
      else toast.error(r.error)
    })
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
        <input
          type="checkbox"
          checked={aiOn}
          onChange={(e) => update({ ai_enabled: e.target.checked })}
          className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
        />
        <Sparkles className="h-3.5 w-3.5 text-brand" /> Redactar con IA (único por cliente)
      </label>

      {aiOn ? (
        <div className="space-y-2 rounded-lg border border-brand/30 bg-brand/5 p-3">
          <label className="block text-[12px] text-muted-foreground">¿De qué trata el mensaje?</label>
          <textarea
            value={String(c.ai_brief ?? "")}
            onChange={(e) => update({ ai_brief: e.target.value })}
            rows={2}
            placeholder="Ej: Felicitar el cumpleaños con calidez e invitar a una sesión de fotos."
            className={inputCls}
          />
          <div className="flex items-center gap-2">
            <input
              value={String(c.ai_tone ?? "")}
              onChange={(e) => update({ ai_tone: e.target.value })}
              placeholder="Tono (opcional): cálido, festivo…"
              className={`${inputCls} flex-1`}
            />
            <button
              type="button"
              onClick={doPreview}
              disabled={previewing}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-brand bg-card px-2.5 py-1.5 text-[12px] font-medium text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
            >
              {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Previsualizar
            </button>
          </div>
          {preview && (
            <div className="rounded-lg border border-border bg-background p-2.5 text-[12px]">
              <p className="font-semibold text-foreground">{preview.subject || "(sin asunto)"}</p>
              <div
                className="mt-1 leading-snug text-muted-foreground [&_p]:mb-1.5"
                dangerouslySetInnerHTML={{ __html: preview.body }}
              />
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            La IA escribe un mensaje distinto para cada cliente al enviar. Reemplaza la plantilla.
          </p>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-[12px] text-muted-foreground">Plantilla (editable en Plantillas de email)</label>
          <select
            value={String(c.template_slug ?? "engagement_generic")}
            onChange={(e) => update({ template_slug: e.target.value })}
            className={inputCls}
          >
            {EMAIL_TEMPLATES.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
