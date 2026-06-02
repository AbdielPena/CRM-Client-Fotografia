import type { Metadata } from "next"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Sparkles, Bot, CheckCircle2, AlertTriangle } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { geminiConfigured } from "@/server/services/ai/gemini.service"
import { saveAssistantSettingsAction } from "@/server/actions/ai-assistant.actions"
import { AppTopbar } from "@/components/layout/app-topbar"
import { AssistantChat } from "@/components/ai/assistant-chat"
import { KnowledgeManager } from "@/components/ai/knowledge-manager"

export const metadata: Metadata = { title: "AI Assistant Center" }
export const dynamic = "force-dynamic"

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"

export default async function AiAssistantPage() {
  const session = await requireStudioAuth()
  const sb = createSupabaseServerClient() as unknown as SupabaseClient

  const [studioRes, settingsRes, knowledgeRes, unread] = await Promise.all([
    sb.from("studios").select("name").eq("id", session.studioId).maybeSingle(),
    sb.from("chatflow_settings").select("*").eq("studio_id", session.studioId).maybeSingle(),
    sb
      .from("chatflow_knowledge")
      .select("id, kind, question, answer")
      .eq("studio_id", session.studioId)
      .order("created_at", { ascending: false }),
    countUnreadNotifications(session.studioId),
  ])

  const studioName = (studioRes.data as { name?: string } | null)?.name ?? "tu estudio"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = settingsRes.data as any
  const assistantName = s?.assistant_name ?? "Asistente"
  const greeting =
    (s?.greeting as string | null) ??
    `¡Hola! 👋 Soy ${assistantName} de ${studioName}. ¿En qué te puedo ayudar hoy?`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const knowledge = ((knowledgeRes.data as any[]) ?? []).map((k) => ({
    id: k.id as string,
    kind: (k.kind as string) ?? "faq",
    question: (k.question as string | null) ?? null,
    answer: k.answer as string,
  }))
  const aiReady = geminiConfigured()

  return (
    <>
      <AppTopbar
        eyebrow="Marketing & Atención"
        title="AI Assistant Center"
        description="Asistente conversacional con IA, entrenado con tus paquetes y FAQ"
        unreadNotifications={unread}
        actions={
          aiReady ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> IA conectada (Gemini)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> IA no configurada
            </span>
          )
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Chat de prueba */}
          <div className="lg:col-span-2">
            <AssistantChat greeting={greeting} />
            <p className="mt-2 text-[11px] text-muted-foreground">
              La IA responde con tus <strong>paquetes reales</strong> y tu conocimiento. Captura
              leads y escala a un humano cuando hace falta. Próxima fase: conectar WhatsApp e
              Instagram.
            </p>
          </div>

          {/* Persona / configuración */}
          <div className="space-y-5">
            <form action={saveAssistantSettingsAction} className="sf-card space-y-3 p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand" />
                <h2 className="text-sm font-semibold text-foreground">Personalidad</h2>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Nombre del asistente
                </label>
                <input
                  name="assistant_name"
                  defaultValue={assistantName}
                  className={inputCls}
                  placeholder="Ej: Abby"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Saludo inicial
                </label>
                <input
                  name="greeting"
                  defaultValue={(s?.greeting as string | null) ?? ""}
                  className={inputCls}
                  placeholder="¡Hola! 👋 ¿En qué te ayudo?"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Personalidad / instrucciones
                </label>
                <textarea
                  name="persona"
                  rows={4}
                  defaultValue={(s?.persona as string | null) ?? ""}
                  className={inputCls}
                  placeholder="Ej: Sé cálida y cercana, tutea, usa emojis con moderación. Somos un estudio especializado en quinceañeras y bodas en Santo Domingo…"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input type="checkbox" name="handoff_enabled" defaultChecked={s ? !!s.handoff_enabled : true} value="true" className="h-4 w-4" />
                Permitir que la IA pase a un humano
              </label>
              <button
                type="submit"
                className="w-full rounded-lg bg-brand py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90"
              >
                Guardar
              </button>
              <input type="hidden" name="enabled" value="true" />
            </form>

            <div className="sf-card p-4 text-xs text-muted-foreground">
              <Bot className="mb-1 inline h-4 w-4 text-brand" />
              <p>
                La IA ya conoce tus <strong>paquetes</strong> automáticamente. Agrega abajo las{" "}
                <strong>FAQ, políticas y promos</strong> para que responda aún mejor.
              </p>
            </div>
          </div>
        </div>

        {/* Entrenamiento (conocimiento) */}
        <KnowledgeManager items={knowledge} />
      </div>
    </>
  )
}
