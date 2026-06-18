import { NextResponse } from "next/server"
import { z } from "zod"

import { createDressSelection } from "@/server/services/dress-selection.service"

/**
 * Endpoint público de "selección de vestidos" del catálogo de abbypixel.com.
 *  - POST: guarda la selección (4–6 vestidos) + crea un lead, devuelve el link.
 *  - OPTIONS: preflight CORS.
 * Mismo patrón de CORS/honeypot/rate-limit que /api/public/contact.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STUDIO_SLUG = process.env["NEXT_PUBLIC_DEFAULT_STUDIO_SLUG"] ?? "abbypixel"

const ALLOWED_ORIGINS = new Set([
  "https://abbypixel.com",
  "https://www.abbypixel.com",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
])

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://abbypixel.com"
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  }
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  })
}

// ── Rate limit simple por IP (in-memory) ─────────────────────────────────────
const WINDOW_MS = 10 * 60 * 1000
const MAX_HITS = 6
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k)
    }
  }
  return recent.length > MAX_HITS
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]!.trim()
  return req.headers.get("x-real-ip") ?? "unknown"
}

const DressSchema = z.object({
  name: z.string().trim().max(120).optional().or(z.literal("")),
  image: z.string().trim().url("Imagen inválida").max(600),
  collection: z.string().trim().max(60).optional().or(z.literal("")),
})

const SelectionSchema = z.object({
  name: z.string().trim().min(2, "Nombre requerido").max(120),
  whatsapp: z.string().trim().min(6, "WhatsApp requerido").max(40),
  tentativeDate: z.string().trim().max(120).optional().or(z.literal("")),
  planInterest: z.string().trim().max(120).optional().or(z.literal("")),
  dresses: z
    .array(DressSchema)
    .min(4, "Elige al menos 4 vestidos")
    .max(6, "Máximo 6 vestidos"),
  // Honeypot: debe llegar vacío.
  website: z.string().optional(),
})

export async function POST(req: Request) {
  const headers = corsHeaders(req.headers.get("origin"))

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers })
  }

  const parsed = SelectionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400, headers },
    )
  }
  const data = parsed.data

  // Honeypot: fingir éxito sin crear nada.
  if (data.website && data.website.trim().length > 0) {
    return NextResponse.json({ ok: true }, { headers })
  }

  const ip = clientIp(req)
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Demasiados envíos. Intenta de nuevo en unos minutos." },
      { status: 429, headers },
    )
  }

  try {
    const result = await createDressSelection({
      studioSlug: STUDIO_SLUG,
      clientName: data.name,
      whatsapp: data.whatsapp,
      tentativeDate: data.tentativeDate || null,
      planInterest: data.planInterest || null,
      dresses: data.dresses.map((d) => ({
        name: d.name || "",
        image: d.image,
        collection: d.collection || null,
      })),
    })

    if (result.status === "not_found") {
      return NextResponse.json(
        { error: "Estudio no encontrado." },
        { status: 404, headers },
      )
    }
    return NextResponse.json(
      { ok: true, token: result.token, url: result.url },
      { headers },
    )
  } catch (e) {
    console.error("[public/dress-selections] error", e)
    return NextResponse.json(
      { error: "No se pudo guardar tu selección. Intenta de nuevo." },
      { status: 500, headers },
    )
  }
}
