import "server-only"

/**
 * Wrapper de bajo nivel del LLM (Gemini). Provider-agnostic por dentro: si más
 * adelante cambiamos a Groq/OpenRouter/pago, solo se reemplaza este archivo.
 * Soporta function-calling (tools) para que el asistente ejecute acciones.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"

export type GeminiPart =
  | { text: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { functionCall: { name: string; args: Record<string, any> } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { functionResponse: { name: string; response: Record<string, any> } }

export interface GeminiContent {
  role: "user" | "model" | "function"
  parts: GeminiPart[]
}

export interface GeminiFunctionDecl {
  name: string
  description: string
  // JSON-schema (subset OpenAPI) — tipos en minúscula
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters?: Record<string, any>
}

export interface GeminiResult {
  text: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  functionCall: { name: string; args: Record<string, any> } | null
  error?: string
}

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY
}

export async function geminiGenerate(opts: {
  system?: string
  contents: GeminiContent[]
  tools?: GeminiFunctionDecl[]
  temperature?: number
}): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash"
  if (!key) return { text: "", functionCall: null, error: "GEMINI_NOT_CONFIGURED" }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    contents: opts.contents,
    generationConfig: { temperature: opts.temperature ?? 0.6 },
  }
  if (opts.system) {
    body.system_instruction = { parts: [{ text: opts.system }] }
  }
  if (opts.tools && opts.tools.length > 0) {
    body.tools = [{ functionDeclarations: opts.tools }]
  }

  try {
    const res = await fetch(
      `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) {
      const t = await res.text()
      console.error("[gemini] HTTP", res.status, t.slice(0, 300))
      return { text: "", functionCall: null, error: `HTTP_${res.status}` }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any
    const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? []
    let text = ""
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let functionCall: { name: string; args: Record<string, any> } | null = null
    for (const p of parts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyP = p as any
      if (anyP.text) text += anyP.text
      if (anyP.functionCall && !functionCall) functionCall = anyP.functionCall
    }
    return { text: text.trim(), functionCall }
  } catch (err) {
    console.error("[gemini] fetch failed", err)
    return { text: "", functionCall: null, error: "FETCH_FAILED" }
  }
}
