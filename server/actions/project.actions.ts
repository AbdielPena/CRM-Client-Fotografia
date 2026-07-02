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
    })
    revalidatePath(`/projects/${projectId}`)
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
