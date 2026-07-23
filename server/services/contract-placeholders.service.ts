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
import { resolveRetentionMonths } from "@/lib/retention"

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
         id, name, event_type, event_date, location, package_id, retention_months,
         client:clients(id, name, email, phone, address, city, country),
         package:packages(id, name, price, currency, deposit_percent),
         service_category:service_categories(retention_months)
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
  // Anticipo (factura de reserva) y saldo de reserva (segunda cuota). Distintos
  // del "saldo pendiente" (= total − pagado): aquí son los montos fijos del 50/50.
  let depositAmount = 0
  let balanceAmount = 0
  let currency = (pkg as { currency?: string } | null)?.currency ?? "USD"

  if (project) {
    const { data: invoicesRaw } = await supabase
      .from("invoices")
      .select("id, total, status, currency, amount_paid, kind, installment_number")
      .eq("project_id", (project as { id: string }).id)
      .is("deleted_at", null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoices = (invoicesRaw ?? []) as any[]
    totalPrice = invoices.reduce(
      (sum, inv) => sum + Number(inv.total ?? 0),
      0,
    )
    if (invoices[0]?.currency) currency = invoices[0].currency

    // Anticipo = factura kind='deposit' (o cuota 1); saldo = kind='balance' (o cuota 2)
    const depInv = invoices.find(
      (i) => i.kind === "deposit" || i.installment_number === 1,
    )
    const balInv = invoices.find(
      (i) => i.kind === "balance" || i.installment_number === 2,
    )
    depositAmount = Number(depInv?.total ?? 0)
    balanceAmount = Number(balInv?.total ?? 0)

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

  // Fallback del anticipo/saldo: si no hubo facturas de reserva, derivar del
  // deposit_percent del paquete (default 50%).
  if (!depositAmount && totalPrice) {
    const depPct = Number((pkg as { deposit_percent?: number } | null)?.deposit_percent ?? 50)
    depositAmount = Number(((totalPrice * depPct) / 100).toFixed(2))
    balanceAmount = Number((totalPrice - depositAmount).toFixed(2))
  }

  const remaining = Math.max(0, totalPrice - amountPaid)

  // ─── Variables disponibles ─────────────────────────────────────────────
  const c = (client ?? {}) as Record<string, unknown>
  const p = (project ?? {}) as Record<string, unknown>
  const pk = (pkg ?? {}) as Record<string, unknown>
  const s = (studio ?? {}) as Record<string, unknown>
  const svcCat = project ? pickOne((project as { service_category?: unknown }).service_category) : null
  const retentionMonths = resolveRetentionMonths(
    (p.retention_months as number | null | undefined) ?? null,
    (svcCat as { retention_months?: number | null } | null)?.retention_months ?? null,
  )

  // Número sin símbolo de moneda (las plantillas usan "{{moneda}} {{paquete_precio}}")
  const FORMAT_NUM = (n: number | string | null | undefined): string => {
    const v = Number(n ?? 0)
    if (!Number.isFinite(v)) return "0.00"
    return v.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const todayStr = FORMAT_DATE(new Date().toISOString())
  const clientName = String(c.name ?? contract.signed_name ?? "")
  const clientEmail = String(c.email ?? contract.signed_email ?? "")
  const clientPhone = String(c.phone ?? "")
  const studioName = String(s.name ?? "")
  const pkgName = String(pk.name ?? "")
  const eventType = String(p.event_type ?? "")
  const eventDateStr = FORMAT_DATE(p.event_date as string | null)
  const eventTimeStr = FORMAT_TIME(p.event_date as string | null)
  const eventLocation = String(p.location ?? "")
  const totalStr = FORMAT_MONEY(totalPrice, currency)
  const paidStr = FORMAT_MONEY(amountPaid, currency)
  const remainingStr = FORMAT_MONEY(remaining, currency)
  const signedDate = contract.signed_at ? FORMAT_DATE(contract.signed_at) : ""
  const signerName = String(contract.signed_name ?? "")

  // Mapa de variables. Incluimos las claves en INGLÉS (compat) y sus ALIAS en
  // ESPAÑOL, que son las que usan realmente las plantillas y el editor.
  const vars: PlaceholderVars = {
    // Cliente
    client_name: clientName,
    cliente_nombre: clientName,
    client_email: clientEmail,
    cliente_email: clientEmail,
    client_phone: clientPhone,
    cliente_telefono: clientPhone,
    client_address: String(c.address ?? ""),
    cliente_direccion: String(c.address ?? ""),
    client_city: String(c.city ?? ""),
    cliente_ciudad: String(c.city ?? ""),
    client_country: String(c.country ?? ""),
    cliente_pais: String(c.country ?? ""),

    // Proyecto / evento
    project_name: String(p.name ?? ""),
    proyecto_nombre: String(p.name ?? ""),
    event_type: eventType,
    evento_tipo: eventType,
    event_date: eventDateStr,
    evento_fecha: eventDateStr,
    event_time: eventTimeStr,
    evento_hora: eventTimeStr,
    event_location: eventLocation,
    evento_locacion: eventLocation,
    evento_lugar: eventLocation,

    // Paquete (paquete_precio SIN símbolo; package_price CON símbolo por compat)
    package_name: pkgName,
    paquete_nombre: pkgName,
    package_price: FORMAT_MONEY(pk.price as number | null, currency),
    paquete_precio: FORMAT_NUM(pk.price as number | null),

    // Montos
    total_price: totalStr,
    valor_total: totalStr,
    precio_total: totalStr,
    amount_paid: paidStr,
    monto_pagado: paidStr,
    remaining_balance: remainingStr,
    saldo_pendiente: remainingStr,
    // Anticipo (reserva) y saldo de reserva — montos fijos del plan (50/50 por
    // default), distintos de "saldo pendiente". Para "paga al firmar" / "paga el día".
    deposit_amount: FORMAT_MONEY(depositAmount, currency),
    anticipo: FORMAT_MONEY(depositAmount, currency),
    monto_anticipo: FORMAT_MONEY(depositAmount, currency),
    balance_amount: FORMAT_MONEY(balanceAmount, currency),
    saldo_reserva: FORMAT_MONEY(balanceAmount, currency),
    monto_restante: FORMAT_MONEY(balanceAmount, currency),
    currency,
    moneda: currency,

    // Studio
    studio_name: studioName,
    estudio_nombre: studioName,
    studio_email: String(s.email ?? ""),
    estudio_email: String(s.email ?? ""),
    studio_phone: String(s.phone ?? ""),
    estudio_telefono: String(s.phone ?? ""),
    studio_address: String(s.address ?? ""),
    estudio_direccion: String(s.address ?? ""),

    // Conservación de archivos (plazo dinámico por categoría/sesión)
    meses_conservacion: String(retentionMonths),
    retention_months: String(retentionMonths),
    politica_conservacion: `Conservación de archivos: Las fotografías permanecerán disponibles en nuestro sistema durante ${retentionMonths} ${retentionMonths === 1 ? "mes" : "meses"} después de la entrega. Transcurrido ese tiempo, los archivos serán eliminados de nuestros servidores y no podremos garantizar su recuperación. Recomendamos descargar y respaldar todas sus fotografías inmediatamente después de la entrega.`,

    // Fechas del contrato
    contract_date: todayStr,
    fecha_contrato: todayStr,
    today: todayStr,
    hoy: todayStr,
    fecha: todayStr,

    // Firma: NO mapear {{signature_client}}/{{signature_studio}} aquí — esos los
    // reemplaza injectSignatures() con la imagen real en su posición. Mapearlos
    // como texto rompería el posicionado. Solo exponemos fecha/nombre legibles.
    signed_name: signerName,
    nombre_firmante: signerName,
    signed_at: signedDate,
    firma_cliente: signedDate,
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
