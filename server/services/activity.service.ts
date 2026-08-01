import 'server-only'

import { activityLogRepo } from '@/server/repositories'
import { createSupabaseServerClient } from '@/server/supabase/server'
import { untypedService } from '@/server/supabase/untyped'

export type ActorType = 'user' | 'system' | 'client'

export type LogActivityParams = {
  studioId: string
  action: string
  entityType: string
  entityId?: string
  actorId?: string | null
  actorType?: ActorType
  actorEmail?: string | null
  actorName?: string | null
  description?: string | null
  beforeState?: Record<string, unknown> | null
  afterState?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
  /**
   * Cuando la acción ocurre desde un contexto público (anon), el invoker no
   * tiene INSERT sobre activity_log. Pasa true para usar service-role.
   */
  elevated?: boolean
}

/**
 * Registra un evento de auditoría. Nunca lanza — el audit log es
 * best-effort, no debe tumbar el flujo de negocio.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await activityLogRepo.log(
      {
        studioId: params.studioId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        actorType:
          params.actorType ?? (params.actorId ? 'user' : 'system'),
        actorUserId: params.actorId ?? undefined,
        actorEmail: params.actorEmail ?? undefined,
        actorName: params.actorName ?? undefined,
        description: params.description ?? undefined,
        beforeState: params.beforeState ?? undefined,
        afterState: params.afterState ?? undefined,
        metadata: params.metadata ?? {},
      },
      { elevated: params.elevated ?? false },
    )
  } catch (err) {
    console.error('[logActivity] unexpected error', err)
  }
}

/**
 * Timeline de actividad para una entidad específica (orden cronológico asc).
 */
export async function getEntityActivity(
  studioId: string,
  entityType: string,
  entityId: string,
  limit = 50,
) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('activity_log')
    .select(
      'id, action, entity_type, entity_id, actor_type, actor_user_id, actor_email, actor_name, description, metadata, created_at',
    )
    .eq('studio_id', studioId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[getEntityActivity]', error.message)
    return []
  }
  return data ?? []
}

/** Una línea del historial, ya lista para pintar en el dashboard. */
export interface RecentActivityItem {
  id: string
  action: string
  description: string | null
  actorName: string | null
  actorType: string | null
  entityType: string | null
  entityId: string | null
  createdAt: string
  /** A dónde lleva el clic (null si esa entidad no tiene pantalla propia). */
  href: string | null
  /** De quién es este movimiento. Lo que Abdiel quiere leer de un vistazo. */
  clientName: string | null
}

/** Ruta de la pantalla de cada tipo de entidad (para poder abrirla del historial). */
const ENTITY_HREF: Record<string, (id: string) => string> = {
  project: (id) => `/projects/${id}`,
  client: (id) => `/clients/${id}`,
  invoice: (id) => `/invoices/${id}`,
  contract: (id) => `/contracts/${id}`,
  gallery: (id) => `/galleries/${id}`,
  booking_request: (id) => `/bookings/${id}`,
  lead: (id) => `/leads/${id}`,
  task: () => `/tasks`,
}

/**
 * Resuelve DE QUIÉN es cada movimiento.
 *
 * El historial solo guarda tipo + id de la entidad, así que hay que ir a
 * buscar el nombre. Se hace en bloque (una consulta por tabla, no una por
 * línea) y en dos saltos cuando hace falta: proyecto/galería/factura →
 * client_id → nombre del cliente.
 */
async function resolverNombresDeCliente(
  studioId: string,
  filas: Array<{ entity_type: string | null; entity_id: string | null }>,
): Promise<Map<string, string>> {
  // Cliente sin tipos: las tablas se eligen por nombre en tiempo de ejecución
  // (`projects`, `galleries`, `invoices`…), cosa que el cliente tipado no
  // admite. Igual todas las consultas van acotadas por `studio_id`.
  const supabase = untypedService()
  const porTipo = (t: string) =>
    filas
      .filter((r) => r.entity_type === t && r.entity_id)
      .map((r) => r.entity_id as string)

  const nombres = new Map<string, string>() // `${tipo}:${id}` → nombre
  const clientIdPorClave = new Map<string, string>() // clave → client_id
  const clientIds = new Set<string>()

  const recoger = (
    tipo: string,
    filas: Array<{ id: string; client_id: string | null }>,
  ) => {
    for (const r of filas) {
      if (!r.client_id) continue
      clientIdPorClave.set(`${tipo}:${r.id}`, r.client_id)
      clientIds.add(r.client_id)
    }
  }

  // Entidades que apuntan a un cliente por client_id.
  const conClientId: Array<[string, string]> = [
    ["project", "projects"],
    ["gallery", "galleries"],
    ["invoice", "invoices"],
  ]
  await Promise.all(
    conClientId.map(async ([tipo, tabla]) => {
      const ids = porTipo(tipo)
      if (!ids.length) return
      const { data } = await supabase
        .from(tabla)
        .select("id, client_id")
        .eq("studio_id", studioId)
        .in("id", ids)
      recoger(tipo, (data ?? []) as Array<{ id: string; client_id: string | null }>)
    }),
  )

  // El cliente ES la entidad.
  const idsCliente = porTipo("client")
  idsCliente.forEach((id) => clientIds.add(id))

  // Las solicitudes guardan el nombre escrito a mano (aún sin cliente creado).
  const idsSolicitud = porTipo("booking_request")
  if (idsSolicitud.length) {
    const { data } = await supabase
      .from("booking_requests")
      .select("id, client_name, client_id")
      .eq("studio_id", studioId)
      .in("id", idsSolicitud)
    for (const r of (data ?? []) as Array<{
      id: string
      client_name: string | null
      client_id: string | null
    }>) {
      if (r.client_name) nombres.set(`booking_request:${r.id}`, r.client_name)
      else if (r.client_id) {
        clientIdPorClave.set(`booking_request:${r.id}`, r.client_id)
        clientIds.add(r.client_id)
      }
    }
  }

  // Un solo viaje por todos los nombres de cliente.
  if (clientIds.size) {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("studio_id", studioId)
      .in("id", [...clientIds])
    const porId = new Map(
      ((data ?? []) as Array<{ id: string; name: string | null }>).map((c) => [
        c.id,
        c.name ?? "",
      ]),
    )
    for (const id of idsCliente) {
      const n = porId.get(id)
      if (n) nombres.set(`client:${id}`, n)
    }
    for (const [clave, clientId] of clientIdPorClave) {
      if (nombres.has(clave)) continue
      const n = porId.get(clientId)
      if (n) nombres.set(clave, n)
    }
  }

  return nombres
}

/**
 * Últimos movimientos del estudio, sin filtrar por entidad: es el "Registros
 * recientes" del dashboard — qué pasó hoy, de quién, y con enlace a cada cosa.
 */
export async function getRecentActivity(
  studioId: string,
  limit = 12,
): Promise<RecentActivityItem[]> {
  const supabase = createSupabaseServerClient()
  // El dashboard NO muestra finanzas: se dejan fuera los movimientos de dinero
  // (pagos y el espejo a FinanzApp). No es solo criterio: son la mayoría de las
  // líneas del historial, así que dejarlos taparía todo lo demás. Eso se ve en
  // /finance.
  const { data, error } = await supabase
    .from('activity_log')
    .select(
      'id, action, entity_type, entity_id, actor_type, actor_name, description, created_at',
    )
    .eq('studio_id', studioId)
    .not('action', 'like', 'finanzapp.%')
    .not('action', 'like', '%payment%')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[getRecentActivity]', error.message)
    return []
  }

  const filas = (data ?? []) as Array<{
    id: string
    action: string
    entity_type: string | null
    entity_id: string | null
    actor_type: string | null
    actor_name: string | null
    description: string | null
    created_at: string
  }>

  const nombres = await resolverNombresDeCliente(studioId, filas).catch(
    () => new Map<string, string>(),
  )

  return filas.map((r) => ({
    id: r.id,
    action: r.action,
    description: r.description,
    actorName: r.actor_name,
    actorType: r.actor_type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    createdAt: r.created_at,
    clientName:
      r.entity_type && r.entity_id
        ? (nombres.get(`${r.entity_type}:${r.entity_id}`) ?? null)
        : null,
    href:
      r.entity_type && r.entity_id && ENTITY_HREF[r.entity_type]
        ? ENTITY_HREF[r.entity_type](r.entity_id)
        : null,
  }))
}
