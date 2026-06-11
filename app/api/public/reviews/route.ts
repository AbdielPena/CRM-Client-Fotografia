import { NextResponse } from "next/server"

import { untypedService } from "@/server/supabase/untyped"

// Endpoint público consumido por abbypixel.com (sitio estático) para mostrar
// reseñas en /resenas/. Devuelve sólo registros con published=true.
//
// GET /api/public/reviews?studio=abbypixel&limit=50

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=300, s-maxage=300",
    Vary: "Origin",
  }
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const studioSlug = url.searchParams.get("studio") ?? "abbypixel"
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 100)
  const headers = corsHeaders(req.headers.get("origin"))

  const sb = untypedService()
  const { data: studioRow } = await sb
    .from("studios")
    .select("id")
    .eq("slug", studioSlug)
    .maybeSingle()
  const studio = studioRow as { id: string } | null
  if (!studio) {
    return NextResponse.json({ reviews: [] }, { headers })
  }

  const { data: rows } = await sb
    .from("engagement_feedback")
    .select("stars, comment, display_name, photo_url, project_title, published_at")
    .eq("studio_id", studio.id)
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(limit)

  const reviews = ((rows ?? []) as Array<{
    stars: number | null
    comment: string | null
    display_name: string | null
    photo_url: string | null
    project_title: string | null
    published_at: string | null
  }>).map((r) => ({
    stars: r.stars,
    comment: r.comment,
    name: r.display_name ?? "Cliente",
    photo: r.photo_url,
    project: r.project_title,
    date: r.published_at,
  }))

  return NextResponse.json({ reviews }, { headers })
}
