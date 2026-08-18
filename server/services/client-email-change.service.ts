import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { logActivity } from "@/server/services/activity.service"

/**
 * Cambiar el correo de un cliente de verdad: no solo en su ficha.
 *
 * El correo está COPIADO en varios sitios (la reserva, los formularios que
 * llenó, sus listas de selección, sus favoritos…). Cada copia es una foto del
 * momento en que se guardó. Si solo se corrige la ficha, los avisos siguen
 * saliendo al correo viejo y la clienta pierde de vista lo que ya había
 * elegido.
 *
 * Aquí va todo junto:
 *   1. la ficha,
 *   2. lo que está EN COLA sin enviar → se redirige al nuevo,
 *   3. las copias en reservas / formularios / galerías,
 *   4. opcionalmente, REENVIAR al correo nuevo lo que ya se había mandado al
 *      viejo (el enlace de la galería, la factura, el contrato…).
 *
 * El reenvío le escribe a una clienta real, así que nunca es automático: el
 * estudio ve primero cuántos y cuáles son, y lo pide expresamente.
 */

/** Tablas que guardan una copia del correo del cliente, y su columna. */
const COPIAS: Array<{ tabla: string; columna: string }> = [
  { tabla: "booking_requests", columna: "client_email" },
  { tabla: "form_responses", columna: "client_email" },
  { tabla: "gallery_collections", columna: "client_email" },
  { tabla: "gallery_favorites", columna: "client_email" },
  { tabla: "gallery_print_selections", columna: "client_email" },
  { tabla: "gallery_asset_comments", columna: "client_email" },
  { tabla: "gallery_downloads", columna: "client_email" },
  { tabla: "gallery_zip_exports", columna: "client_email" },
  { tabla: "gallery_drive_backups", columna: "shared_with_email" },
]

// Los contratos firmados NO se tocan a propósito: `contracts.signed_email` es
// la constancia de con qué correo se firmó. Reescribirla falsearía el documento.

export interface EmailChangePreview {
  clienteNombre: string
  actual: string | null
  nuevo: string
  /** Correos en cola sin enviar: se redirigen solos. */
  enCola: number
  /** Correos YA enviados al correo viejo — candidatos a reenvío. */
  enviados: number
  /** Los más recientes, para que el estudio vea qué se reenviaría. */
  muestra: Array<{ id: string; asunto: string; fecha: string | null }>
  /** Copias del correo en reservas, formularios y galerías. */
  copias: number
  /** Otro cliente del estudio ya usa ese correo. */
  duplicadoCon: string | null
}

function normaliza(email: string): string {
  return email.trim().toLowerCase()
}

/** Qué pasaría si se aplica el cambio. NO escribe nada. */
export async function previewClientEmailChange(
  studioId: string,
  clientId: string,
  nuevoEmailRaw: string,
): Promise<EmailChangePreview> {
  const sb = untypedService()
  const nuevo = normaliza(nuevoEmailRaw)

  const { data: cli } = await sb
    .from("clients")
    .select("name, email")
    .eq("studio_id", studioId)
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle()
  const cliente = cli as { name: string; email: string | null } | null
  if (!cliente) throw new Error("CLIENT_NOT_FOUND")

  const actual = cliente.email ? normaliza(cliente.email) : null

  const res: EmailChangePreview = {
    clienteNombre: cliente.name,
    actual,
    nuevo,
    enCola: 0,
    enviados: 0,
    muestra: [],
    copias: 0,
    duplicadoCon: null,
  }
  if (!actual || actual === nuevo) return res

  // ¿Ese correo ya es de otro cliente? No se bloquea —una madre y su hija
  // pueden compartirlo— pero el estudio tiene que verlo antes de aceptar.
  const { data: otros } = await sb
    .from("clients")
    .select("id, name")
    .eq("studio_id", studioId)
    .eq("email", nuevo)
    .is("deleted_at", null)
    .neq("id", clientId)
    .limit(1)
  res.duplicadoCon = ((otros ?? [])[0] as { name: string } | undefined)?.name ?? null

  // `to_email` es citext: `.eq` compara sin distinguir mayúsculas.
  const { count: cola } = await sb
    .from("email_queue")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .eq("to_email", actual)
    .eq("status", "pending")
  res.enCola = cola ?? 0

  const { data: enviados, count: total } = await sb
    .from("email_queue")
    .select("id, subject, sent_at", { count: "exact" })
    .eq("studio_id", studioId)
    .eq("to_email", actual)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(10)
  res.enviados = total ?? 0
  res.muestra = (
    (enviados ?? []) as Array<{ id: string; subject: string; sent_at: string | null }>
  ).map((e) => ({ id: e.id, asunto: e.subject, fecha: e.sent_at }))

  for (const { tabla, columna } of COPIAS) {
    const { count } = await sb
      .from(tabla)
      .select("*", { count: "exact", head: true })
      .eq(columna, actual)
    res.copias += count ?? 0
  }

  return res
}

/**
 * Lleva el correo nuevo a todas sus copias. Lo usan tanto la pantalla de
 * cambiar correo como la edición de la ficha completa, para que las dos puertas
 * hagan exactamente lo mismo.
 */
export async function propagateClientEmail(
  studioId: string,
  clientId: string,
  viejo: string,
  nuevo: string,
): Promise<number> {
  const sb = untypedService()
  let tocadas = 0

  for (const { tabla, columna } of COPIAS) {
    const { data, error } = await sb
      .from(tabla)
      .update({ [columna]: nuevo })
      .eq(columna, viejo)
      .select("*")
    if (error) {
      console.error(`[correo-cliente] copia en ${tabla} falló`, error)
      continue
    }
    tocadas += (data ?? []).length
  }

  // Las reservas se enlazan también por client_id: una reserva creada con el
  // correo mal escrito no haría match por `client_email`.
  const { error: errRes } = await sb
    .from("booking_requests")
    .update({ client_email: nuevo })
    .eq("studio_id", studioId)
    .eq("client_id", clientId)
  if (errRes) console.error("[correo-cliente] reservas por client_id", errRes)

  return tocadas
}

export interface EmailChangeResult {
  ok: true
  anterior: string | null
  nuevo: string
  redirigidos: number
  reenviados: number
  copias: number
}

/** Tope de reenvíos por cambio: un descuido no puede volverse una avalancha. */
const MAX_REENVIOS = 60

export async function changeClientEmail(
  studioId: string,
  actorId: string | null,
  clientId: string,
  nuevoEmailRaw: string,
  opts: { reenviar?: boolean } = {},
): Promise<EmailChangeResult> {
  const sb = untypedService()
  const nuevo = normaliza(nuevoEmailRaw)

  const { data: cli } = await sb
    .from("clients")
    .select("name, email")
    .eq("studio_id", studioId)
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle()
  const cliente = cli as { name: string; email: string | null } | null
  if (!cliente) throw new Error("CLIENT_NOT_FOUND")

  const viejo = cliente.email ? normaliza(cliente.email) : null
  if (viejo === nuevo) {
    return { ok: true, anterior: viejo, nuevo, redirigidos: 0, reenviados: 0, copias: 0 }
  }

  // 1) La ficha. Con `select` porque un UPDATE que no toca filas NO da error.
  const { data: upd, error: errCli } = await sb
    .from("clients")
    .update({ email: nuevo, updated_at: new Date().toISOString() })
    .eq("studio_id", studioId)
    .eq("id", clientId)
    .select("id")
  if (errCli) throw errCli
  if ((upd ?? []).length === 0) throw new Error("CLIENT_EMAIL_UPDATE_EMPTY")

  let redirigidos = 0
  let reenviados = 0
  let copias = 0

  if (viejo) {
    // 2) Lo que aún no ha salido va al correo nuevo. Es lo más urgente: son
    //    avisos que el sistema mandaría en minutos.
    const { data: cola, error: errCola } = await sb
      .from("email_queue")
      .update({
        to_email: nuevo,
        to_name: cliente.name,
        updated_at: new Date().toISOString(),
      })
      .eq("studio_id", studioId)
      .eq("to_email", viejo)
      .eq("status", "pending")
      .select("id")
    if (errCola) console.error("[correo-cliente] redirigir la cola falló", errCola)
    redirigidos = (cola ?? []).length

    // 3) Las copias.
    copias = await propagateClientEmail(studioId, clientId, viejo, nuevo)

    // 4) Reenvío de lo ya enviado, solo si lo piden.
    if (opts.reenviar) {
      reenviados = await reenviarHistorial(studioId, viejo, nuevo, cliente.name)
    }
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "client",
    entityId: clientId,
    action: "client.email_changed",
    metadata: { anterior: viejo, nuevo, redirigidos, reenviados, copias },
  })

  return { ok: true, anterior: viejo, nuevo, redirigidos, reenviados, copias }
}

/**
 * Vuelve a encolar al correo nuevo lo que ya se le había enviado al viejo.
 *
 * Se re-encola el MISMO cuerpo que salió, no se regenera desde la plantilla:
 * así recibe exactamente lo que le llegó —mismos enlaces, mismos montos— y no
 * una versión recalculada hoy.
 *
 * `metadata.reenvio_de` guarda de qué correo salió cada copia, para no mandar
 * dos veces lo mismo si el estudio repite la operación.
 */
async function reenviarHistorial(
  studioId: string,
  viejo: string,
  nuevo: string,
  nombre: string,
): Promise<number> {
  const sb = untypedService()

  const { data: previos } = await sb
    .from("email_queue")
    .select(
      "id, subject, body_html, body_text, from_name, reply_to, template_slug, related_entity_type, related_entity_id, sent_at",
    )
    .eq("studio_id", studioId)
    .eq("to_email", viejo)
    .eq("status", "sent")
    .order("sent_at", { ascending: true })
    .limit(MAX_REENVIOS)

  const lista = (previos ?? []) as Array<Record<string, unknown>>
  if (lista.length === 0) return 0

  // Lo ya reenviado antes no se repite.
  const { data: yaHechos } = await sb
    .from("email_queue")
    .select("metadata")
    .eq("studio_id", studioId)
    .eq("to_email", nuevo)
    .not("metadata->>reenvio_de", "is", null)
  const hechos = new Set(
    ((yaHechos ?? []) as Array<{ metadata: { reenvio_de?: string } | null }>)
      .map((r) => r.metadata?.reenvio_de)
      .filter((x): x is string => !!x),
  )

  const filas = lista
    .filter((e) => !hechos.has(String(e.id)))
    .map((e) => ({
      studio_id: studioId,
      to_email: nuevo,
      to_name: nombre,
      subject: e.subject,
      body_html: e.body_html,
      body_text: e.body_text,
      from_email: null,
      from_name: e.from_name,
      reply_to: e.reply_to,
      template_slug: e.template_slug,
      related_entity_type: e.related_entity_type,
      related_entity_id: e.related_entity_id,
      scheduled_for: new Date().toISOString(),
      status: "pending",
      metadata: { reenvio_de: String(e.id), reenvio_desde: viejo },
    }))
  if (filas.length === 0) return 0

  const { data, error } = await sb.from("email_queue").insert(filas).select("id")
  if (error) {
    console.error("[correo-cliente] reenvío falló", error)
    return 0
  }
  return (data ?? []).length
}
