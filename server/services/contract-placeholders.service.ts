/**
 * Renderer de placeholders para contratos.
 *
 * Soporta {{variables}} con datos reales del contrato (cliente, proyecto,
 * paquete, montos, studio, firma). Si un placeholder no tiene valor:
 *   - Devuelve el `fallback` configurado (default: cadena vacía)
 *   - Nunca deja {{variable}} sin reemplazar en el output final
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"

export type PlaceholderVars = Record<string, string>

const FORMAT_DATE = (d: string | null | undefined): string => {
  if (!d) return ""
  try {
    return new Intl.DateTimeFormat("es", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(d))
  } catch {
    return d
  }
}

const FORMAT_TIME = (d: string | null | undefined): string => {
  if (!d) return ""
  try {
    return new Intl.DateTimeFormat("es", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(d))
  } catch {
    return ""
  }
}

const FORMAT_MONEY = (n: number | string | null | undefined, currency = "USD"): string => {
  const value = Number(n ?? 0)
  if (!Number.isFinite(value)) return ""
  try {
    return new Intl.NumberFormat("es", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

/**
 * Construye el set de placeholders para un contrato dado.
 * Carga: contrato + proyecto + cliente + paquete + invoices + studio.
 */
export async function buildContractPlaceholders(contractId: string): Promise<{
  vars: PlaceholderVars
  context: {
    studioName: string
    clientName: string
    clientEmail: string | null
    eventDate: string | null
    packageName: string | null
    totalPrice: number
    amountPaid: number
    remainingBalance: number
    currency: string
  }
}> {
  const supabase = createSupabaseServiceClient()

  // Contrato + proyecto + cliente + studio (relaciones encadenadas)
  const { data: contractRaw } = await supabase
    .from("contracts")
    .select(
      `id, studio_id, project_id, signed_at, signed_name, signed_email, signature_image_url,
       project:projects(
         id, name, event_type, event_date, event_location, package_id,
         client:clients(id, name, email, phone, address, city, country),
         package:packages(id, name, price, currency)
       )`,
    )
    .eq("id", contractId)
    .maybeSingle()

  if (!contractRaw) {
    return {
      vars: {},
      context: {
        studioName: "",
        clientName: "",
        clientEmail: null,
        eventDate: null,
        packageName: null,
        totalPrice: 0,
        amountPaid: 0,
        remainingBalance: 0,
        currency: "USD",
      },
    }
  }

  // Pickone helper inline (proyecto puede venir como array por la join de supabase-js)
  const pickOne = <T>(v: T | T[] | null | undefined): T | null => {
    if (!v) return null
    return Array.isArray(v) ? (v[0] ?? null) : v
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contract = contractRaw as any
  const project = pickOne(contract.project) as Record<string, unknown> | null
  const client = project ? pickOne((project as { client?: unknown }).client) : null
  const pkg = project ? pickOne((project as { package?: unknown }).package) : null

  // Studio
  const { data: studioRow } = await supabase
    .from("studios")
    .select("name, email, phone, address")
    .eq("id", contract.studio_id as string)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studio = studioRow as any

  // Invoices del cliente para este proyecto → totales y pagos
  let totalPrice = 0
  let amountPaid = 0
  let currency = (pkg as { currency?: string } | null)?.currency ?? "USD"

  if (project) {
    const { data: invoicesRaw } = await supabase
      .from("invoices")
      .select("id, total_amount, status, currency, amount_paid")
      .eq("project_id", (project as { id: string }).id)
      .is("deleted_at", null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoices = (invoicesRaw ?? []) as any[]
    totalPrice = invoices.reduce(
      (sum, inv) => sum + Number(inv.total_amount ?? 0),
      0,
    )
    if (invoices[0]?.currency) currency = invoices[0].currency

    // Sumar pagos completed
    const invoiceIds = invoices.map((i) => i.id as string)
    if (invoiceIds.length > 0) {
      const { data: paymentsRaw } = await supabase
        .from("payments")
        .select("amount, status, currency")
        .in("invoice_id", invoiceIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payments = (paymentsRaw ?? []) as any[]
      amountPaid = payments
        .filter(
          (p) => p.status === "completed" || p.status === "succeeded" || p.status === "paid",
        )
        .reduce((s, p) => s + Number(p.amount ?? 0), 0)
    }
  }

  if (!totalPrice && pkg) {
    // Si no hay invoices todavía, usar el precio del paquete como referencia
    totalPrice = Number((pkg as { price?: number }).price ?? 0)
  }

  const remaining = Math.max(0, totalPrice - amountPaid)

  // ─── Variables disponibles ─────────────────────────────────────────────
  const c = (client ?? {}) as Record<string, unknown>
  const p = (project ?? {}) as Record<string, unknown>
  const pk = (pkg ?? {}) as Record<string, unknown>
  const s = (studio ?? {}) as Record<string, unknown>

  const vars: PlaceholderVars = {
    // Cliente
    client_name: String(c.name ?? contract.signed_name ?? ""),
    client_email: String(c.email ?? contract.signed_email ?? ""),
    client_phone: String(c.phone ?? ""),
    client_address: String(c.address ?? ""),
    client_city: String(c.city ?? ""),
    client_country: String(c.country ?? ""),

    // Proyecto / evento
    project_name: String(p.name ?? ""),
    event_type: String(p.event_type ?? ""),
    event_date: FORMAT_DATE(p.event_date as string | null),
    event_time: FORMAT_TIME(p.event_date as string | null),
    event_location: String(p.event_location ?? ""),

    // Paquete
    package_name: String(pk.name ?? ""),
    package_price: FORMAT_MONEY(pk.price as number | null, currency),

    // Montos
    total_price: FORMAT_MONEY(totalPrice, currency),
    amount_paid: FORMAT_MONEY(amountPaid, currency),
    remaining_balance: FORMAT_MONEY(remaining, currency),
    currency,

    // Studio
    studio_name: String(s.name ?? ""),
    studio_email: String(s.email ?? ""),
    studio_phone: String(s.phone ?? ""),
    studio_address: String(s.address ?? ""),

    // Fechas del contrato
    contract_date: FORMAT_DATE(new Date().toISOString()),
    today: FORMAT_DATE(new Date().toISOString()),

    // Firma (se inyecta como <img> al renderizar; el placeholder solo debe
    // mostrar fecha legible o nada si no firmado todavía)
    signature_client: contract.signed_at ? FORMAT_DATE(contract.signed_at) : "",
    signature_studio: "",
    signed_name: String(contract.signed_name ?? ""),
    signed_at: contract.signed_at ? FORMAT_DATE(contract.signed_at) : "",
  }

  return {
    vars,
    context: {
      studioName: String(s.name ?? ""),
      clientName: String(c.name ?? ""),
      clientEmail: (c.email as string | null) ?? null,
      eventDate: (p.event_date as string | null) ?? null,
      packageName: (pk.name as string | null) ?? null,
      totalPrice,
      amountPaid,
      remainingBalance: remaining,
      currency,
    },
  }
}

/**
 * Reemplaza {{variable}} en el body con los valores de `vars`.
 * Si la variable no está en vars, usa `fallback` (default: cadena vacía).
 * Soporta también {{variable|Texto fallback}} inline.
 */
export function renderPlaceholders(
  body: string,
  vars: PlaceholderVars,
  fallback = "",
): string {
  return body.replace(/\{\{\s*([\w-]+)(?:\s*\|\s*([^}]+))?\s*\}\}/g, (_, key: string, inlineFallback?: string) => {
    const val = vars[key]
    if (val !== undefined && val !== null && val !== "") return String(val)
    if (inlineFallback) return inlineFallback.trim()
    return fallback
  })
}

/**
 * Bloque visual de firma — imagen + nombre + fecha.
 * Se usa para reemplazar tanto {{signature_client}} como {{signature_studio}}.
 */
function signatureBlock(
  imageUrl: string | null,
  name: string | null,
  signedAt: string | null,
  label: string,
): string {
  if (!imageUrl) {
    return `<div style="margin:16px 0;padding:24px 16px;border:1px dashed #d4d4d8;border-radius:8px;text-align:center;color:#a1a1aa;font-size:13px">${label}: pendiente</div>`
  }
  return `
<div style="margin:16px 0;padding-top:8px">
  <img src="${imageUrl}" alt="${label}" style="max-height:90px;max-width:280px;display:block;margin-bottom:6px" />
  <div style="border-top:1px solid #18181b;padding-top:6px;display:inline-block;min-width:200px">
    <p style="margin:0;font-size:12.5px;color:#27272a;font-weight:600">${name ?? ""}</p>
    <p style="margin:0;font-size:11.5px;color:#71717a">${label}${signedAt ? ` · ${FORMAT_DATE(signedAt)}` : ""}</p>
  </div>
</div>`.trim()
}

/**
 * Reemplaza los placeholders de firma con imágenes reales en su posición exacta:
 *   {{signature_client}} → imagen + nombre + fecha del cliente
 *   {{signature_studio}} → imagen + nombre + fecha del studio
 *   {{signature_image}}  → alias legacy del cliente
 *
 * Si el body NO contiene los placeholders, agrega ambos bloques al final
 * (compatibilidad con contratos viejos sin placeholders).
 */
export function injectSignatures(
  body: string,
  client: { imageUrl: string | null; name: string | null; signedAt: string | null },
  studio: { imageUrl: string | null; name: string | null; signedAt: string | null },
): string {
  const hasClientPh = /\{\{\s*signature_(client|image)\s*\}\}/.test(body)
  const hasStudioPh = /\{\{\s*signature_studio\s*\}\}/.test(body)

  let out = body
  out = out.replace(
    /\{\{\s*signature_client\s*\}\}/g,
    signatureBlock(client.imageUrl, client.name, client.signedAt, "Firma del cliente"),
  )
  out = out.replace(
    /\{\{\s*signature_image\s*\}\}/g,
    signatureBlock(client.imageUrl, client.name, client.signedAt, "Firma del cliente"),
  )
  out = out.replace(
    /\{\{\s*signature_studio\s*\}\}/g,
    signatureBlock(studio.imageUrl, studio.name, studio.signedAt, "Firma del estudio"),
  )

  // Fallback: si no hay placeholders, append al final
  if (!hasClientPh && !hasStudioPh && (client.imageUrl || studio.imageUrl)) {
    out =
      out +
      `<div style="margin-top:32px;display:flex;gap:32px;flex-wrap:wrap">` +
      signatureBlock(
        client.imageUrl,
        client.name,
        client.signedAt,
        "Firma del cliente",
      ) +
      signatureBlock(
        studio.imageUrl,
        studio.name,
        studio.signedAt,
        "Firma del estudio",
      ) +
      `</div>`
  }
  return out
}

/** @deprecated usar injectSignatures con ambas firmas. Mantenido por compat. */
export function injectSignatureImage(
  body: string,
  signatureImageUrl: string | null,
  signedName: string | null,
  signedAt: string | null,
): string {
  return injectSignatures(
    body,
    { imageUrl: signatureImageUrl, name: signedName, signedAt },
    { imageUrl: null, name: null, signedAt: null },
  )
}
