import { NextResponse } from "next/server"

import {
  getPublicInquiryForm,
  submitPublicInquiryForm,
} from "@/server/services/inquiry-form.service"

/**
 * Endpoint público de los formularios de captación (inquiry_forms),
 * consumido por el script embebible (public/embed/form.js).
 *
 *  - GET  /api/public/forms/[id] → definición del formulario (campos, textos)
 *  - POST /api/public/forms/[id] → crea un lead con los datos enviados
 *  - OPTIONS → preflight CORS
 *
 * CORS abierto (*) para poder embeber en cualquier página del estudio. La
 * defensa real contra abuso es el honeypot + el rate-limit por IP.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

// ── Rate limit por IP (in-memory, proceso único de pm2) ──────────────────────
const WINDOW_MS = 10 * 60 * 1000
const MAX_HITS = 8
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

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const headers = {
    ...corsHeaders(),
    "Cache-Control": "public, max-age=120, s-maxage=120",
  }
  const form = await getPublicInquiryForm(params.id)
  if (!form) {
    return NextResponse.json(
      { error: "Formulario no encontrado o inactivo." },
      { status: 404, headers },
    )
  }
  return NextResponse.json(
    {
      id: form.id,
      name: form.name,
      description: form.description,
      submitLabel: form.submitLabel,
      successMessage: form.successMessage,
      fields: form.schema.fields,
    },
    { headers },
  )
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const headers = corsHeaders()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400, headers },
    )
  }
  const data: Record<string, unknown> =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}

  // Honeypot: fingir éxito sin crear nada.
  if (typeof data["website"] === "string" && (data["website"] as string).trim()) {
    return NextResponse.json({ ok: true }, { headers })
  }
  delete data["website"]

  const ip = clientIp(req)
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Demasiados envíos. Intenta de nuevo en unos minutos." },
      { status: 429, headers },
    )
  }

  try {
    const result = await submitPublicInquiryForm(params.id, data, {
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    })
    if (result.status === "not_found") {
      return NextResponse.json(
        { error: "Formulario no encontrado o inactivo." },
        { status: 404, headers },
      )
    }
    if (result.status === "invalid") {
      return NextResponse.json(
        { error: "Revisa los campos marcados.", fields: result.errors },
        { status: 400, headers },
      )
    }
    return NextResponse.json({ ok: true }, { headers })
  } catch (e) {
    console.error("[public/forms] error", e)
    return NextResponse.json(
      { error: "No se pudo enviar. Intenta de nuevo." },
      { status: 500, headers },
    )
  }
}
