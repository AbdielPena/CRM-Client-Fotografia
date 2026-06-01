"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createClient,
  createClientWithBooking,
  updateClient,
  deleteClient,
  restoreClient,
  permanentlyDeleteClient,
  ClientCreationError,
} from "@/server/services/client.service"
import {
  createClientSchema,
  createClientWithBookingSchema,
  updateClientSchema,
} from "@/lib/validations/client.schema"
import { sendAutoContractAndInvoiceEmails } from "@/server/services/post-booking-emails.service"
import { onClientCreated } from "@/server/services/project-automation.service"

// ---------------------------------------------------------------------------
// Tipos de estado — usados por useActionState en el formulario
// ---------------------------------------------------------------------------

export type CreateClientState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  /** id del cliente recién creado (solo se usa en el redirect)*/
  clientId?: string
  /** valores que el usuario escribió — para re-pintarlos tras un error */
  values?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

// ---------------------------------------------------------------------------
// CREATE — flujo integral (cliente + paquete + 2 facturas + contrato)
// ---------------------------------------------------------------------------

export async function createClientAction(
  _prevState: CreateClientState,
  formData: FormData
): Promise<CreateClientState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch (err) {
    return {
      ok: false,
      message: "Tu sesión expiró. Vuelve a iniciar sesión para continuar.",
    }
  }

  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    source: formData.get("source"),
    notes: formData.get("notes"),
    address: formData.get("address"),
    city: formData.get("city"),
    country: formData.get("country"),
    instagramHandle: formData.get("instagramHandle"),
    websiteUrl: formData.get("websiteUrl"),
    packageId: formData.get("packageId"),
    eventType: formData.get("eventType"),
    eventDate: formData.get("eventDate"),
    projectName: formData.get("projectName"),
    location: formData.get("location"),
    reserveDueInDays: formData.get("reserveDueInDays"),
  }

  const parsed = createClientWithBookingSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Revisa los campos marcados en rojo.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: collectValues(formData),
    }
  }

  let clientId: string
  let emailBundle: {
    clientId: string
    projectId: string
    contractId: string
    invoice1Id: string
  } | null = null
  try {
    const result = await createClientWithBooking(
      session.studioId,
      session.userId,
      parsed.data
    )
    clientId = result.client_id
    // Solo armamos el bundle de emails si la RPC creó factura (flujo manual
    // del CRM). El flujo de booking usa skip_invoices → no entra por acá.
    emailBundle = result.invoice1_id
      ? {
          clientId: result.client_id,
          projectId: result.project_id,
          contractId: result.contract_id,
          invoice1Id: result.invoice1_id,
        }
      : null
  } catch (err) {
    if (err instanceof ClientCreationError) {
      return {
        ok: false,
        message: err.message,
        fieldErrors: { [err.field]: [err.message] },
        values: collectValues(formData),
      }
    }
    console.error("[createClientAction] unexpected error", err)
    return {
      ok: false,
      message:
        "Ocurrió un error inesperado al crear el cliente. Nada fue guardado, intenta de nuevo.",
      values: collectValues(formData),
    }
  }

  // Disparar emails automáticos (contrato + factura 50%). Best-effort:
  // si falla, el cliente ya se creó; los emails quedan en email_queue
  // con status='failed' para retry manual desde /settings/emails.
  if (emailBundle) {
    try {
      await sendAutoContractAndInvoiceEmails({
        studioId: session.studioId,
        ...emailBundle,
      })
    } catch (err) {
      console.error("[createClientAction] emails automáticos fallaron:", err)
    }

    // Automatización: mover el proyecto recién creado a "Consulta inicial".
    // Best-effort — si el studio no tiene un status que matchee la keyword,
    // el proyecto se queda con el status default del RPC.
    try {
      await onClientCreated(session.studioId, emailBundle.projectId)
    } catch (err) {
      console.error("[createClientAction] automation onClientCreated falló:", err)
    }
  }

  // Revalidar listas relevantes
  revalidatePath("/clients")
  revalidatePath("/projects")
  revalidatePath("/invoices")
  revalidatePath("/contracts")
  revalidatePath("/dashboard")

  // redirect() lanza NEXT_REDIRECT: debe hacerse fuera del try/catch
  redirect(`/clients/${clientId}?created=1`)
}

// ---------------------------------------------------------------------------
// CREATE — versión simple (usada por conversiones de leads u otros flujos)
// ---------------------------------------------------------------------------

export async function createSimpleClientAction(formData: FormData) {
  const session = await requireStudioAuth()

  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    source: formData.get("source"),
    notes: formData.get("notes"),
    address: formData.get("address"),
    city: formData.get("city"),
    country: formData.get("country"),
    instagramHandle: formData.get("instagramHandle"),
    websiteUrl: formData.get("websiteUrl"),
  }

  const parsed = createClientSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  const client = await createClient(session.studioId, session.userId, parsed.data)
  revalidatePath("/clients")
  redirect(`/clients/${client.id}`)
}

// ---------------------------------------------------------------------------
// UPDATE / DELETE
// ---------------------------------------------------------------------------

export async function updateClientAction(clientId: string, formData: FormData) {
  const session = await requireStudioAuth()

  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    source: formData.get("source"),
    notes: formData.get("notes"),
    address: formData.get("address"),
    city: formData.get("city"),
    country: formData.get("country"),
    instagramHandle: formData.get("instagramHandle"),
    websiteUrl: formData.get("websiteUrl"),
  }

  const parsed = updateClientSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  await updateClient(session.studioId, session.userId, clientId, parsed.data)
  revalidatePath(`/clients/${clientId}`)
  revalidatePath("/clients")
  return { success: true }
}

/**
 * Soft delete del cliente (lo manda a /trash). Acepta motivo opcional.
 * Retorna { ok: true } en éxito, sin redirect, para que el caller decida.
 */
export async function deleteClientAction(
  clientId: string,
  reason?: string | null,
) {
  const session = await requireStudioAuth()
  await deleteClient(session.studioId, session.userId, clientId, reason)
  revalidatePath("/clients")
  revalidatePath("/trash")
  return { ok: true as const }
}

/**
 * Restaura cliente desde /trash. Vuelve al listado principal con todos
 * sus proyectos, contratos, facturas, galerías, notas y bookings.
 */
export async function restoreClientAction(clientId: string) {
  const session = await requireStudioAuth()
  await restoreClient(session.studioId, session.userId, clientId)
  revalidatePath("/clients")
  revalidatePath("/trash")
  return { ok: true as const }
}

/**
 * ELIMINA PERMANENTEMENTE un cliente del trash. Requiere rol admin u owner.
 * Borra de la base de datos al cliente y todas sus entidades dependientes.
 * Acción irreversible — solo se debe llamar desde /trash con doble confirmación.
 */
export async function permanentlyDeleteClientAction(clientId: string) {
  const session = await requireStudioAuth()
  if (session.role !== "admin" && session.role !== "owner") {
    throw new Error("FORBIDDEN_ROLE")
  }
  await permanentlyDeleteClient(session.studioId, session.userId, clientId)
  revalidatePath("/trash")
  return { ok: true as const }
}
