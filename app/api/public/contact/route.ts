import { NextResponse } from "next/server"
import { z } from "zod"

import { createSupabasePublicClient } from "@/server/supabase/server"
import { createPublicLead } from "@/server/services/lead.service"

/**
 * Endpoint público del formulario de contacto de abbypixel.com.
 *
 *  - POST: crea un lead (source='website') en el CRM y avisa al estudio.
 *  - GET:  devuelve las categorías de servicio activas para poblar el dropdown.
 *  - OPTIONS: preflight CORS.
 *
 * Mismo patrón de CORS que /api/public/reviews. No requiere auth (es público).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STUDIO_SLUG =
  process.env["NEXT_PUBLIC_DEFAULT_STUDIO_SLUG"] ?? "abbypixel"

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

// ── Rate limit simple por IP (in-memory, proceso único de pm2) ───────────────
const WINDOW_MS = 10 * 60 * 1000 // 10 min
const MAX_HITS = 5
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  // Limpieza oportunista para no crecer sin límite
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

// ── GET: categorías activas para el dropdown ─────────────────────────────────
export async function GET(req: Request) {
  const headers = {
    ...corsHeaders(req.headers.get("origin")),
    "Cache-Control": "public, max-age=300, s-maxage=300",
  }
  try {
    const supabase = createSupabasePublicClient()
    const { data: studio } = await supabase
      .from("studios_public")
      .select("id")
      .eq("slug", STUDIO_SLUG)
      .maybeSingle()

    if (!studio) return NextResponse.json({ categories: [] }, { headers })

    // service_categories_public ya filtra is_active + no borradas.
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            col: string,
            val: string,
          ) => {
            order: (
              col: string,
            ) => Promise<{ data: Array<Record<string, unknown>> | null }>
          }
        }
      }
    }
    const { data } = await sb
      .from("service_categories_public")
      .select("name, slug, sort_order")
      .eq("studio_id", (studio as { id: string }).id)
      .order("sort_order")

    const categories = (data ?? []).map((c) => ({
      name: String(c["name"] ?? ""),
      slug: String(c["slug"] ?? ""),
    }))
    return NextResponse.json({ categories }, { headers })
  } catch {
    return NextResponse.json({ categories: [] }, { headers })
  }
}

// ── POST: crear lead ─────────────────────────────────────────────────────────
const ContactSchema = z
  .object({
    name: z.string().trim().min(2, "Nombre requerido").max(120),
    email: z
      .union([z.string().email("Email inválido"), z.literal("")])
      .optional(),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    category: z.string().trim().max(120).optional().or(z.literal("")),
    tentativeDate: z.string().trim().max(120).optional().or(z.literal("")),
    message: z.string().trim().max(2000).optional().or(z.literal("")),
    // Honeypot: debe llegar vacío. Si tiene algo → bot.
    website: z.string().optional(),
  })
  .refine((d) => Boolean(d.email) || Boolean(d.phone), {
    message: "Indica al menos un email o un teléfono de contacto.",
    path: ["email"],
  })

export async function POST(req: Request) {
  const headers = corsHeaders(req.headers.get("origin"))

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400, headers },
    )
  }

  const parsed = ContactSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400, headers },
    )
  }
  const data = parsed.data

  // Honeypot: fingir éxito para no dar pistas al bot, sin crear nada.
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
    const result = await createPublicLead(
      {
        studioSlug: STUDIO_SLUG,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        category: data.category || null,
        tentativeDate: data.tentativeDate || null,
        message: data.message || null,
      },
      { ip, userAgent: req.headers.get("user-agent") ?? undefined },
    )

    if (result.status === "not_found") {
      return NextResponse.json(
        { error: "Estudio no encontrado." },
        { status: 404, headers },
      )
    }
    return NextResponse.json({ ok: true }, { headers })
  } catch (e) {
    console.error("[public/contact] error", e)
    return NextResponse.json(
      { error: "No se pudo enviar. Intenta de nuevo." },
      { status: 500, headers },
    )
  }
}
