import { NextResponse } from "next/server"

import { untypedService } from "@/server/supabase/untyped"
import { portfolioImageUrl } from "@/server/services/portfolio.service"

// Endpoint público consumido por abbypixel.com (sitio estático) para el
// portafolio en /portafolio/. Devuelve SOLO ítems published=true.
//
// GET /api/public/portfolio?studio=abbypixel

const ALLOWED_ORIGINS = new Set([
  "https://abbypixel.com",
  "https://www.abbypixel.com",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
])

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://abbypixel.com"
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
  const headers = corsHeaders(req.headers.get("origin"))

  const sb = untypedService()
  const { data: studioRow } = await sb
    .from("studios")
    .select("id")
    .eq("slug", studioSlug)
    .maybeSingle()
  const studio = studioRow as { id: string } | null
  if (!studio) {
    return NextResponse.json({ categories: [], items: [] }, { headers })
  }

  const [{ data: catRows }, { data: itemRows }] = await Promise.all([
    sb
      .from("portfolio_categories")
      .select("id, name, slug, sort_order")
      .eq("studio_id", studio.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    sb
      .from("portfolio_items")
      .select("id, category_id, image_key, width, height, title, description, sort_order")
      .eq("studio_id", studio.id)
      .eq("published", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
  ])

  const categories = ((catRows ?? []) as Array<{
    id: string
    name: string
    slug: string
    sort_order: number
  }>).map((c) => ({ id: c.id, name: c.name, slug: c.slug }))

  // Solo exponemos categorías con al menos una foto publicada, para que la web
  // no muestre pestañas vacías.
  const items = ((itemRows ?? []) as Array<{
    id: string
    category_id: string | null
    image_key: string
    width: number | null
    height: number | null
    title: string | null
    description: string | null
  }>).map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    image: portfolioImageUrl(r.image_key),
    width: r.width,
    height: r.height,
    title: r.title,
    description: r.description,
  }))

  const usedCats = new Set(items.map((i) => i.categoryId))
  const visibleCategories = categories.filter((c) => usedCats.has(c.id))

  return NextResponse.json({ categories: visibleCategories, items }, { headers })
}
