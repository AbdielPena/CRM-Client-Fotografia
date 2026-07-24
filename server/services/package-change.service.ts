import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { getSessionPlanLabel, formatSessionTitle } from "./session-naming.service"
import { logActivity } from "./activity.service"

/**
 * CAMBIO DE PLAN de una sesión, con reajuste de todo lo que depende del plan.
 *
 * Lo que se lee EN VIVO del plan (no hay que tocar nada; se ajusta solo al
 * cambiar `projects.package_id`): impresiones incluidas
 * (`packages.print_entitlements`), requisitos de colaboradores
 * (`collaborator_requirements`), vestido incluido (`includes_dress` +
 * `dress_included_amount`), fotos editadas y demás ajustes de galería.
 *
 * Lo que está GUARDADO como copia y sí hay que recalcular:
 *   1. `projects.total_amount` + `currency`  → precio del nuevo plan
 *   2. `projects.service_category_id`        → si el plan nuevo es de otra categoría
 *   3. `projects.name`                       → el nombre lleva el plan
 *   4. La FACTURA de la sesión               → se ajusta al nuevo total (los pagos
 *      hechos se respetan; el saldo y el estado se recalculan). `updateInvoice`
 *      ya reespeja a la app de Facturación y avisa al cliente.
 *   5. `client_deliveries`                   → días/fecha estimada de entrega
 *      (RPC `upsert_project_delivery` vía recomputeProjectDelivery)
 *
 * Siempre se calcula primero un RESUMEN (preview) para confirmar antes de aplicar.
 */

export type PackageSide = {
  id: string | null
  name: string | null
  price: number | null
  currency: string | null
  deliveryDays: number | null
  categoryId: string | null
  includesDress: boolean
}

export type PackageChangePreview = {
  ok: boolean
  error?: string
  projectId: string
  currentName: string
  clientName: string | null
  from: PackageSide
  to: PackageSide
  money: {
    currentTotal: number
    newTotal: number
    diff: number
    amountPaid: number
    newBalance: number
    invoiceId: string | null
    invoiceNumber: string | null
    invoiceStatus: string | null
  }
  newSessionName: string | null
  categoryChanges: boolean
  warnings: string[]
}

type Rec = Record<string, unknown>

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

async function loadSide(sb: ReturnType<typeof untypedService>, packageId: string | null) {
  if (!packageId) {
    return {
      id: null, name: null, price: null, currency: null,
      deliveryDays: null, categoryId: null, includesDress: false,
    } satisfies PackageSide
  }
  const { data } = await sb
    .from("packages")
    .select("id, name, price, currency, delivery_days, service_category_id, includes_dress, deposit_percent")
    .eq("id", packageId)
    .maybeSingle()
  const p = (data ?? null) as Rec | null
  return {
    id: (p?.id as string) ?? null,
    name: (p?.name as string) ?? null,
    price: p?.price != null ? num(p.price) : null,
    currency: (p?.currency as string) ?? null,
    deliveryDays: p?.delivery_days != null ? num(p.delivery_days) : null,
    categoryId: (p?.service_category_id as string) ?? null,
    includesDress: !!p?.includes_dress,
  } satisfies PackageSide
}

/** Resumen de lo que cambiaría. No modifica nada. */
export async function previewPackageChange(
  studioId: string,
  projectId: string,
  newPackageId: string,
): Promise<PackageChangePreview> {
  const sb = untypedService()

  const { data: projRaw } = await sb
    .from("projects")
    .select(
      "id, name, package_id, total_amount, currency, service_category_id, finalized_at, client_id, client:clients(name)",
    )
    .eq("id", projectId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  const project = (projRaw ?? null) as Rec | null
  const base: PackageChangePreview = {
    ok: false,
    projectId,
    currentName: "",
    clientName: null,
    from: { id: null, name: null, price: null, currency: null, deliveryDays: null, categoryId: null, includesDress: false },
    to: { id: null, name: null, price: null, currency: null, deliveryDays: null, categoryId: null, includesDress: false },
    money: {
      currentTotal: 0, newTotal: 0, diff: 0, amountPaid: 0, newBalance: 0,
      invoiceId: null, invoiceNumber: null, invoiceStatus: null,
    },
    newSessionName: null,
    categoryChanges: false,
    warnings: [],
  }

  if (!project) return { ...base, error: "La sesión no existe." }
  if (String(project.package_id ?? "") === newPackageId) {
    return { ...base, error: "Esa sesión ya tiene ese plan." }
  }

  const from = await loadSide(sb, (project.package_id as string) ?? null)
  const to = await loadSide(sb, newPackageId)
  if (!to.id) return { ...base, error: "El plan seleccionado no existe." }

  const clientRel = project.client
  const clientName =
    (Array.isArray(clientRel) ? (clientRel[0] as Rec | undefined) : (clientRel as Rec | null))?.name as
      | string
      | undefined
  const currentTotal = num(project.total_amount)
  const newTotal = to.price != null ? to.price : currentTotal

  // Factura viva de la sesión (la misma que usa generate_booking_invoice).
  const { data: invRaw } = await sb
    .from("invoices")
    .select("id, invoice_number, total, amount_paid, status")
    .eq("project_id", projectId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
    .limit(1)
  const invoice = (((invRaw ?? []) as Rec[])[0] ?? null) as Rec | null
  const amountPaid = num(invoice?.amount_paid)

  // Nombre nuevo de la sesión (lleva el plan).
  let newSessionName: string | null = null
  try {
    const label = await getSessionPlanLabel(studioId, newPackageId)
    if (label) newSessionName = formatSessionTitle(clientName ?? null, label.label)
  } catch {
    newSessionName = null
  }

  const warnings: string[] = []
  if (project.finalized_at) {
    warnings.push("Esta sesión está finalizada (archivada). Al cambiar el plan seguirá archivada.")
  }
  if (to.price == null) {
    warnings.push("El plan nuevo no tiene precio definido: se conservará el monto actual de la sesión.")
  }
  if (!invoice) {
    warnings.push("Esta sesión no tiene factura: solo se ajustará el monto de la sesión.")
  } else if (amountPaid > newTotal && newTotal > 0) {
    warnings.push(
      `Lo ya pagado (${amountPaid.toLocaleString()}) supera el nuevo total (${newTotal.toLocaleString()}): quedaría un saldo a favor del cliente.`,
    )
  }

  // ¿Ya tiene entrega publicada?
  const { data: gals } = await sb
    .from("galleries")
    .select("id, delivery_ready_at")
    .eq("studio_id", studioId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
  if (((gals ?? []) as Rec[]).some((g) => !!g.delivery_ready_at)) {
    warnings.push("Esta sesión ya tiene la entrega publicada. Revisa bien antes de cambiar el plan.")
  }

  const categoryChanges = !!to.categoryId && to.categoryId !== ((project.service_category_id as string) ?? null)

  return {
    ok: true,
    projectId,
    currentName: (project.name as string) ?? "",
    clientName: clientName ?? null,
    from,
    to,
    money: {
      currentTotal,
      newTotal,
      diff: newTotal - currentTotal,
      amountPaid,
      newBalance: Math.max(0, newTotal - amountPaid),
      invoiceId: (invoice?.id as string) ?? null,
      invoiceNumber: (invoice?.invoice_number as string) ?? null,
      invoiceStatus: (invoice?.status as string) ?? null,
    },
    newSessionName,
    categoryChanges,
    warnings,
  }
}

/** Aplica el cambio de plan y reajusta todo. Devuelve el resumen aplicado. */
export async function applyPackageChange(
  studioId: string,
  userId: string,
  projectId: string,
  newPackageId: string,
): Promise<PackageChangePreview & { applied?: string[] }> {
  const preview = await previewPackageChange(studioId, projectId, newPackageId)
  if (!preview.ok) return preview

  const sb = untypedService()
  const applied: string[] = []

  // 1) La sesión: plan, monto, moneda, categoría y nombre.
  const patch: Rec = { package_id: newPackageId, updated_at: new Date().toISOString() }
  if (preview.to.price != null) {
    patch.total_amount = preview.to.price
    if (preview.to.currency) patch.currency = preview.to.currency
    applied.push(`Monto de la sesión → ${preview.money.newTotal.toLocaleString()}`)
  }
  if (preview.categoryChanges && preview.to.categoryId) {
    patch.service_category_id = preview.to.categoryId
    applied.push("Categoría de servicio actualizada")
  }
  if (preview.newSessionName) {
    patch.name = preview.newSessionName
    applied.push(`Nombre → ${preview.newSessionName}`)
  }
  const { error: projErr } = await sb
    .from("projects")
    .update(patch)
    .eq("id", projectId)
    .eq("studio_id", studioId)
  if (projErr) return { ...preview, ok: false, error: projErr.message }

  // 2) La factura: se ajusta al nuevo total. Los pagos hechos NO se tocan;
  //    updateInvoice recalcula saldo/estado, reemplaza ítems y reespeja a la
  //    app de Facturación.
  if (preview.money.invoiceId && preview.to.price != null && preview.money.diff !== 0) {
    try {
      const { data: full } = await sb
        .from("invoices")
        .select("due_date, notes, title")
        .eq("id", preview.money.invoiceId)
        .maybeSingle()
      const inv = (full ?? {}) as Rec
      const { data: pkgRow } = await sb
        .from("packages")
        .select("deposit_percent")
        .eq("id", newPackageId)
        .maybeSingle()
      const depositPercent = num((pkgRow as Rec | null)?.deposit_percent)

      const { updateInvoice } = await import("./invoice.service")
      await updateInvoice(studioId, userId, preview.money.invoiceId, {
        items: [
          {
            description: preview.to.name ?? "Plan",
            quantity: 1,
            unitPrice: preview.to.price,
            taxRate: 0,
          },
        ],
        currency: preview.to.currency ?? undefined,
        title: `Factura — ${preview.to.name ?? "Plan"}`,
        dueDate: (inv.due_date as string) ?? null,
        notes: (inv.notes as string) ?? null,
        depositPercent: depositPercent > 0 ? depositPercent : undefined,
      })
      applied.push(
        `Factura ${preview.money.invoiceNumber ?? ""} ajustada (saldo ${preview.money.newBalance.toLocaleString()})`,
      )
    } catch (e) {
      applied.push(
        `⚠ No se pudo ajustar la factura: ${e instanceof Error ? e.message : "error"}`,
      )
    }
  }

  // 3) Entrega: recalcula días y fecha estimada con el plazo del plan nuevo.
  try {
    const { recomputeProjectDelivery } = await import("./delivery.service")
    await recomputeProjectDelivery(studioId, projectId)
    applied.push("Fecha de entrega recalculada")
  } catch {
    applied.push("⚠ No se pudo recalcular la entrega")
  }

  // 4) Historial.
  try {
    await logActivity({
      studioId,
      action: "project.package_changed",
      entityType: "project",
      entityId: projectId,
      actorType: "user",
      description: `Plan cambiado: ${preview.from.name ?? "sin plan"} → ${preview.to.name}`,
      metadata: {
        fromPackageId: preview.from.id,
        toPackageId: preview.to.id,
        fromTotal: preview.money.currentTotal,
        toTotal: preview.money.newTotal,
        amountPaid: preview.money.amountPaid,
        newBalance: preview.money.newBalance,
        invoiceId: preview.money.invoiceId,
        applied,
      },
    })
  } catch {
    /* el historial no debe romper el cambio */
  }

  return { ...preview, applied }
}
