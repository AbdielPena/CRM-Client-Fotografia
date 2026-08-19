"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createProject,
  updateProject,
  deleteProject,
} from "@/server/services/project.service"
import {
  createProjectSchema,
  updateProjectSchema,
} from "@/lib/validations/project.schema"

export async function createProjectAction(formData: FormData) {
  const session = await requireStudioAuth()

  const raw = {
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    eventType: formData.get("eventType") ?? formData.get("type"),
    status: formData.get("status") || "booked",
    eventDate: formData.get("eventDate"),
    location: formData.get("location"),
    notes: formData.get("notes"),
    packageId: formData.get("packageId"),
    serviceCategoryId: formData.get("serviceCategoryId"),
    totalAmount: formData.get("totalAmount"),
    currency: formData.get("currency") || "DOP",
  }

  const parsed = createProjectSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  const project = await createProject(session.studioId, session.userId, parsed.data)
  revalidatePath("/projects")
  redirect(`/projects/${project.id}`)
}

/**
 * Registra/edita el vestido seleccionado para la sesión (quinceañera):
 * nombre/código, proveedor, costo y notas internas. El costo entra en el
 * cálculo interno de ganancia del proyecto.
 */
export async function saveSessionDressAction(
  projectId: string,
  data: {
    dressCatalogId?: string | null
    dressName: string
    dressProvider: string
    dressCost: string
    dressNotes: string
    dressImageUrl?: string | null
  },
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireStudioAuth()
  try {
    const raw = (data.dressCost ?? "").trim()
    const cost = raw === "" ? null : Number(raw)
    if (cost !== null && (Number.isNaN(cost) || cost < 0)) {
      return { ok: false, error: "El costo del vestido no es válido" }
    }
    const { setSessionDress } = await import("@/server/services/session-dress.service")
    await setSessionDress(session.studioId, projectId, {
      dressCatalogId: data.dressCatalogId ?? null,
      dressName: data.dressName ?? "",
      dressProvider: data.dressProvider ?? "",
      dressCost: cost,
      dressNotes: data.dressNotes ?? "",
      dressImageUrl: data.dressImageUrl ?? null,
    })
    revalidatePath(`/projects/${projectId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

/** Marca el gasto del vestido de la sesión como pagado (o pendiente) — settle en FinanzApp. */
export async function markSessionDressPaidAction(
  projectId: string,
  paid: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireStudioAuth()
  try {
    const { setSessionDressPaid } = await import("@/server/services/session-dress.service")
    await setSessionDressPaid(session.studioId, projectId, paid)
    revalidatePath(`/projects/${projectId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

/**
 * Agrega el "costo extra de vestido" como una línea a la factura de la sesión
 * (la más reciente no cancelada). El dueño confirma el monto. Recalcula el total
 * y se espeja a Facturación (vía updateInvoice). Marca dress_extra_invoiced.
 */
export async function addDressExtraToInvoiceAction(
  projectId: string,
  amount: number,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireStudioAuth()
  try {
    const monto = Number(amount)
    if (!(monto > 0)) return { ok: false, error: "El monto del costo extra no es válido" }
    const { untypedService } = await import("@/server/supabase/untyped")
    const sb = untypedService()
    const { data: inv } = await sb
      .from("invoices")
      .select("id")
      .eq("project_id", projectId)
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!inv) {
      return { ok: false, error: "La sesión no tiene factura donde agregar el costo extra." }
    }
    const invoiceId = (inv as { id: string }).id
    const { data: items } = await sb
      .from("invoice_items")
      .select("description, quantity, unit_price")
      .eq("invoice_id", invoiceId)
      .order("sort_order")
    const existing = (
      (items ?? []) as Array<{ description: string; quantity: number; unit_price: number }>
    ).map((it) => ({
      description: it.description,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unit_price),
      taxRate: 0,
    }))
    const { updateInvoice } = await import("@/server/services/invoice.service")
    await updateInvoice(session.studioId, session.userId, invoiceId, {
      items: [
        ...existing,
        { description: "Costo extra de vestido", quantity: 1, unitPrice: monto, taxRate: 0 },
      ],
    })
    await sb
      .from("projects")
      .update({ dress_extra_invoiced: true })
      .eq("id", projectId)
      .eq("studio_id", session.studioId)
    revalidatePath(`/projects/${projectId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

/**
 * Marca/desmarca una sesión como "antigua": cuando está marcada, el detalle NO
 * pide hora, colaborador ni vestido (sesiones que pasaron antes de agregar esas
 * funciones al sistema). No borra datos; solo oculta las marcas de pendiente.
 */
export async function setRequirementsWaivedAction(
  projectId: string,
  waived: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireStudioAuth()
  try {
    const { untypedService } = await import("@/server/supabase/untyped")
    const sb = untypedService()
    const { error } = await sb
      .from("projects")
      .update({ requirements_waived: waived })
      .eq("id", projectId)
      .eq("studio_id", session.studioId)
    if (error) return { ok: false, error: error.message }
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/projects")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

/**
 * Finaliza (archiva) una sesión: sale de TODAS las vistas activas y queda solo
 * en el apartado "Finalizadas". Gated: solo si ya está entregada. Reversible.
 */
export async function finalizeProjectAction(
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireStudioAuth()
  try {
    const { isProjectDelivered, finalizeProject } = await import(
      "@/server/services/project.service"
    )
    const delivered = await isProjectDelivered(session.studioId, projectId)
    if (!delivered) {
      return { ok: false, error: "Solo puedes finalizar una sesión que ya esté entregada." }
    }
    await finalizeProject(session.studioId, projectId)
    revalidatePath("/projects")
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/clients")
    revalidatePath("/deliveries")
    revalidatePath("/tasks")
    revalidatePath("/galleries")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

/**
 * Cuánto dinero hay en juego antes de cancelar. Lo usa el diálogo para decidir
 * si tiene que preguntar qué hacer con el abono (si no se cobró nada, no
 * pregunta nada).
 */
export async function previewProjectCancellationAction(
  projectId: string,
): Promise<{ ok: boolean; paidAmount: number; currency: string; error?: string }> {
  const session = await requireStudioAuth()
  try {
    const { untypedService } = await import("@/server/supabase/untyped")
    const sb = untypedService()
    const { data } = await sb
      .from("invoices")
      .select("amount_paid, currency")
      .eq("studio_id", session.studioId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
    const rows = (data ?? []) as Array<{
      amount_paid: number | string
      currency: string | null
    }>
    const paidAmount = rows.reduce((n, r) => n + Number(r.amount_paid ?? 0), 0)
    return {
      ok: true,
      paidAmount,
      currency: rows[0]?.currency ?? "DOP",
    }
  } catch (e) {
    return {
      ok: false,
      paidAmount: 0,
      currency: "DOP",
      error: e instanceof Error ? e.message : "Error",
    }
  }
}

/**
 * Cancela una sesión: anula lo que no se cobró, libera la fecha, apaga el
 * reloj de entrega y la archiva de todas las vistas.
 *
 * NUNCA toca la ficha del cliente — sigue activo y recibiendo los correos de
 * fidelidad. Para sacarlo de todo habría que mandarlo a la papelera, que es
 * otra acción distinta.
 */
export async function cancelProjectAction(
  projectId: string,
  input: {
    reason?: string | null
    deposit: "kept" | "refunded" | "none"
    notifyClient?: boolean
  },
): Promise<{
  ok: boolean
  error?: string
  paidAmount?: number
  cancelledInvoices?: number
  refundRecorded?: boolean
  clientNotified?: boolean
}> {
  const session = await requireStudioAuth()
  try {
    const { cancelProject } = await import(
      "@/server/services/project-cancel.service"
    )
    const res = await cancelProject({
      studioId: session.studioId,
      projectId,
      actorId: session.userId ?? null,
      reason: input.reason ?? null,
      deposit: input.deposit,
      notifyClient: input.notifyClient !== false,
    })
    for (const p of [
      "/projects",
      `/projects/${projectId}`,
      "/clients",
      "/deliveries",
      "/tasks",
      "/galleries",
      "/dashboard",
      "/invoices",
      "/calendar",
    ]) {
      revalidatePath(p)
    }
    return {
      ok: true,
      paidAmount: res.paidAmount,
      cancelledInvoices: res.cancelledInvoices,
      refundRecorded: res.refundRecorded,
      clientNotified: res.clientNotified,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

/** Deshace la cancelación: la sesión vuelve al tablero. */
export async function undoProjectCancellationAction(
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireStudioAuth()
  try {
    const { reopenCancelledProject } = await import(
      "@/server/services/project-cancel.service"
    )
    await reopenCancelledProject(session.studioId, projectId)
    for (const p of [
      "/projects",
      `/projects/${projectId}`,
      "/clients",
      "/deliveries",
      "/dashboard",
    ]) {
      revalidatePath(p)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

/**
 * Resumen de lo que cambiaría al mover la sesión a otro plan (no aplica nada).
 * Se muestra al fotógrafo para que confirme antes de tocar dinero.
 */
export async function previewProjectPackageChangeAction(
  projectId: string,
  newPackageId: string,
) {
  const session = await requireStudioAuth()
  const { previewPackageChange } = await import(
    "@/server/services/package-change.service"
  )
  return previewPackageChange(session.studioId, projectId, newPackageId)
}

/**
 * Cambia el plan de la sesión y reajusta monto, factura (con su espejo en
 * Facturación), entrega, categoría y nombre. Impresiones, colaboradores y
 * vestido se leen del plan en vivo, así que se ajustan solos.
 */
export async function changeProjectPackageAction(
  projectId: string,
  newPackageId: string,
) {
  const session = await requireStudioAuth()
  const { applyPackageChange } = await import(
    "@/server/services/package-change.service"
  )
  const result = await applyPackageChange(
    session.studioId,
    session.userId,
    projectId,
    newPackageId,
  )
  if (result.ok) {
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/projects")
    revalidatePath("/clients")
    revalidatePath("/invoices")
    revalidatePath("/deliveries")
    revalidatePath("/dashboard")
  }
  return result
}

/** Reabre una sesión finalizada (vuelve a las vistas activas). */
export async function reopenProjectAction(
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireStudioAuth()
  try {
    const { unfinalizeProject } = await import("@/server/services/project.service")
    await unfinalizeProject(session.studioId, projectId)
    revalidatePath("/projects")
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/clients")
    revalidatePath("/deliveries")
    revalidatePath("/tasks")
    revalidatePath("/galleries")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

/**
 * Guarda los datos de la quinceañera en la sesión: nombre (se usa como nombre
 * por defecto al crear galerías) y cumpleaños (define la entrega pautada: 2
 * días antes del cumpleaños / 3 semanas después de la sesión, lo que ocurra
 * primero). Alimenta el pre-llenado de galerías + el badge de prioridad.
 */
export async function saveQuinceDetailsAction(
  projectId: string,
  data: { name: string; birthday: string },
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireStudioAuth()
  try {
    const name = (data.name ?? "").trim().slice(0, 120)
    const birthday = (data.birthday ?? "").trim()
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      return { ok: false, error: "Fecha inválida" }
    }
    // quinceanera_name/_birthday no están en los tipos generados → cliente
    // untyped (mismo patrón que session-dress.service).
    const { untypedService } = await import("@/server/supabase/untyped")
    const supabase = untypedService()
    const { error } = await supabase
      .from("projects")
      .update({
        quinceanera_name: name || null,
        quinceanera_birthday: birthday || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
    if (error) throw new Error("No se pudieron guardar los datos")

    // Recalcular la entrega pautada (client_deliveries) con la nueva fecha.
    const { recomputeProjectDelivery } = await import(
      "@/server/services/delivery.service"
    )
    await recomputeProjectDelivery(session.studioId, projectId)

    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/galleries")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

/**
 * Cambia MANUALMENTE la hora de una sesión, con motivo → actualiza Google
 * Calendar y avisa al cliente por correo + WhatsApp.
 */
export async function changeSessionTimeAction(
  projectId: string,
  newTime: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; emailed?: boolean; whatsappApi?: boolean }> {
  const session = await requireStudioAuth()
  try {
    const { changeSessionTime } = await import(
      "@/server/services/session-schedule.service"
    )
    const res = await changeSessionTime(
      session.studioId,
      session.userId,
      projectId,
      newTime,
      reason,
    )
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/projects")
    return { ok: res.ok, emailed: res.emailed, whatsappApi: res.whatsappApi }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

/**
 * Envía (encola) un correo a los clientes de sesiones de quinceañera que aún NO
 * tienen el nombre registrado, con un link público para que lo inscriban.
 */
export async function sendQuinceNameRequestsAction(): Promise<{
  ok: boolean
  sent?: number
  total?: number
  error?: string
}> {
  const session = await requireStudioAuth()
  try {
    const { sendQuinceNameRequests } = await import(
      "@/server/services/quince-name.service"
    )
    const { sent, total } = await sendQuinceNameRequests(session.studioId)
    revalidatePath("/projects")
    return { ok: true, sent, total }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

export async function updateProjectAction(projectId: string, formData: FormData) {
  const session = await requireStudioAuth()

  const raw = {
    name: formData.get("name"),
    eventType: formData.get("eventType") ?? formData.get("type"),
    status: formData.get("status"),
    eventDate: formData.get("eventDate"),
    location: formData.get("location"),
    notes: formData.get("notes"),
    packageId: formData.get("packageId"),
    serviceCategoryId: formData.get("serviceCategoryId"),
    totalAmount: formData.get("totalAmount"),
  }

  const parsed = updateProjectSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  await updateProject(session.studioId, session.userId, projectId, parsed.data)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/projects")
  return { success: true }
}

export async function deleteProjectAction(projectId: string) {
  const session = await requireStudioAuth()
  await deleteProject(session.studioId, session.userId, projectId)
  revalidatePath("/projects")
  redirect("/projects")
}

/**
 * Ajusta la ganancia de UNA sesión. Vacío = volver a la del plan.
 *
 * Hace falta por los descuentos: la ganancia se copia del plan al asignarlo,
 * pero si a la clienta se le cobra menos, la real baja y el plan no tiene cómo
 * saberlo.
 */
export async function updateSessionProfitAction(formData: FormData) {
  const session = await requireStudioAuth()
  const projectId = String(formData.get("projectId") ?? "").trim()
  if (!projectId) return { error: "Falta la sesión" }

  const raw = String(formData.get("amount") ?? "").trim()
  let amount: number | null = null
  if (raw !== "") {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return { error: "Ese monto no es válido" }
    amount = n
  }

  const { untypedService } = await import("@/server/supabase/untyped")
  const sb = untypedService()
  // `select` porque un UPDATE que no toca filas NO da error: sin esto, un id
  // de otro estudio se guardaría "bien" sin cambiar nada.
  const { data, error } = await sb
    .from("projects")
    .update({ profit_amount: amount, updated_at: new Date().toISOString() })
    .eq("studio_id", session.studioId)
    .eq("id", projectId)
    .is("deleted_at", null)
    .select("id")
  if (error) return { error: error.message }
  if ((data ?? []).length === 0) return { error: "No se encontró la sesión" }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/finance/tithe")
  return { success: true as const }
}

// ═══════════════════════════════════════════════════════════════════════════
// Las FECHAS de una sesión
//
// Una sesión puede llevar varias: la sesión de fotos un día y la fiesta otro,
// cada una con su hora, su lugar y su propio plazo de entrega.
// ═══════════════════════════════════════════════════════════════════════════

function numeroOnull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim()
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export async function updateProjectEventAction(formData: FormData) {
  const session = await requireStudioAuth()
  const eventId = String(formData.get("eventId") ?? "").trim()
  const projectId = String(formData.get("projectId") ?? "").trim()
  if (!eventId) return { error: "Falta el evento" }

  const { updateProjectEvent } = await import(
    "@/server/services/project-event.service"
  )
  try {
    const ev = await updateProjectEvent(session.studioId, eventId, {
      name: String(formData.get("name") ?? ""),
      eventDate: String(formData.get("eventDate") ?? "").slice(0, 10),
      eventTime: String(formData.get("eventTime") ?? ""),
      eventEndTime: String(formData.get("eventEndTime") ?? ""),
      location: String(formData.get("location") ?? ""),
      photoCount: numeroOnull(formData.get("photoCount")),
      deliveryDays: numeroOnull(formData.get("deliveryDays")),
      includesPrints: formData.get("includesPrints") === "on",
      includesBook: formData.get("includesBook") === "on",
    })
    // `update` que no toca filas NO da error: sin fila devuelta, no era suya.
    if (!ev) return { error: "No se encontró ese evento" }

    await propagarEvento(session.studioId, projectId || ev.projectId, ev)
    if (projectId) revalidatePath(`/projects/${projectId}`)
    revalidatePath("/calendar")
    return { success: true as const }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar" }
  }
}

/** Cambia cuál de las fechas manda como fecha de la sesión. */
export async function setPrimaryProjectEventAction(formData: FormData) {
  const session = await requireStudioAuth()
  const eventId = String(formData.get("eventId") ?? "").trim()
  const projectId = String(formData.get("projectId") ?? "").trim()
  if (!eventId || !projectId) return { error: "Faltan datos" }

  const { setPrimaryEvent, listEventsByProject, primaryEvent } = await import(
    "@/server/services/project-event.service"
  )
  try {
    await setPrimaryEvent(session.studioId, projectId, eventId)
    const eventos = await listEventsByProject(session.studioId, projectId)
    const ppal = primaryEvent(eventos)
    if (ppal) await propagarEvento(session.studioId, projectId, ppal)
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/calendar")
    revalidatePath("/projects")
    return { success: true as const }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cambiar" }
  }
}

export async function addProjectEventAction(formData: FormData) {
  const session = await requireStudioAuth()
  const projectId = String(formData.get("projectId") ?? "").trim()
  const eventDate = String(formData.get("eventDate") ?? "").slice(0, 10)
  if (!projectId) return { error: "Falta la sesión" }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return { error: "Falta la fecha" }

  const { addProjectEvent } = await import(
    "@/server/services/project-event.service"
  )
  try {
    const ev = await addProjectEvent(session.studioId, projectId, {
      name: String(formData.get("name") ?? "").trim() || "Evento",
      eventDate,
      eventTime: String(formData.get("eventTime") ?? ""),
      location: String(formData.get("location") ?? ""),
      photoCount: numeroOnull(formData.get("photoCount")),
      deliveryDays: numeroOnull(formData.get("deliveryDays")),
      includesPrints: formData.get("includesPrints") === "on",
      includesBook: formData.get("includesBook") === "on",
    })
    if (ev) await propagarEvento(session.studioId, projectId, ev)
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/calendar")
    return { success: true as const }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo agregar" }
  }
}

export async function deleteProjectEventAction(formData: FormData) {
  const session = await requireStudioAuth()
  const eventId = String(formData.get("eventId") ?? "").trim()
  const projectId = String(formData.get("projectId") ?? "").trim()
  if (!eventId) return { error: "Falta el evento" }

  const { deleteProjectEvent } = await import(
    "@/server/services/project-event.service"
  )
  try {
    await deleteProjectEvent(session.studioId, eventId)
    if (projectId) revalidatePath(`/projects/${projectId}`)
    revalidatePath("/calendar")
    return { success: true as const }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo quitar" }
  }
}

/**
 * Lo que arrastra tocar un evento.
 *
 * Si es el PRINCIPAL, su fecha es la fecha de la sesión: la copia a `projects`
 * (de ahí viven el tablero, el recordatorio de saldo y "sesión realizada"),
 * recalcula el plazo de entrega y re-sincroniza Google. Si es secundario, solo
 * su propio evento de Google.
 */
async function propagarEvento(
  studioId: string,
  projectId: string | null,
  ev: {
    id: string
    isPrimary?: boolean
    eventDate: string
    eventTime?: string | null
    eventEndTime?: string | null
    location?: string | null
    deliveryDays?: number | null
  },
) {
  if (!projectId) return
  try {
    if (ev.isPrimary) {
      const { untypedService } = await import("@/server/supabase/untyped")
      const sb = untypedService()
      await sb
        .from("projects")
        .update({
          event_date: ev.eventDate,
          event_time: ev.eventTime ?? null,
          event_end_time: ev.eventEndTime ?? null,
          location: ev.location ?? null,
          delivery_days_override: ev.deliveryDays ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("studio_id", studioId)
        .eq("id", projectId)

      const { recomputeProjectDelivery } = await import(
        "@/server/services/delivery.service"
      )
      await recomputeProjectDelivery(studioId, projectId)

      const { syncProjectById } = await import(
        "@/server/services/google-calendar.service"
      )
      await syncProjectById(studioId, projectId).catch(() => false)
    } else {
      const { syncProjectEventToGoogle } = await import(
        "@/server/services/google-calendar.service"
      )
      await syncProjectEventToGoogle(studioId, ev.id).catch(() => null)
    }
  } catch (e) {
    console.error("[evento] propagar", e instanceof Error ? e.message : e)
  }
}
