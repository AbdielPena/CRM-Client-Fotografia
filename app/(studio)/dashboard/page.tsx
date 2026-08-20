import type { Metadata } from "next"
import { Plus, Camera, Images, Printer } from "lucide-react"
import Link from "next/link"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { untypedServer } from "@/server/supabase/untyped"
import { getRecentActivity } from "@/server/services/activity.service"
import { listStudioPrintOverview } from "@/server/services/print-selection.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { listUpcomingDeliveriesByTrack } from "@/server/services/delivery.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import {
  ClientActivityFeed,
  esDeCliente,
} from "@/components/dashboard/client-activity-feed"
import {
  FocusCard,
  type FocusNext,
} from "@/components/dashboard/focus-card"

export const metadata: Metadata = { title: "Dashboard" }

// Lo que pasa aquí cambia cada día (y varias veces al día): nunca desde caché.
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

/**
 * Dashboard — cuatro cosas y nada más.
 *
 * Antes era una pila de listas del mismo tamaño (tareas, sesiones, registros,
 * impresiones, contadores, entregas) y había que leerlas enteras para saber qué
 * tocaba. Abdiel pidió cuatro respuestas concretas:
 *
 *   1. ¿Cuál es la próxima entrega de digitales?
 *   2. ¿Qué impresiones están listas?
 *   3. ¿Cuál es la próxima sesión a realizar?
 *   4. ¿Qué han hecho mis clientes últimamente?
 *
 * Las tres primeras son "lo próximo": van arriba, en tarjetas con su propio
 * color, con LO QUE SIGUE en grande y lo demás en letra chica. La cuarta va
 * abajo, ancha, como un diario por días.
 *
 * Lo que se fue (no se borró, vive en su página): las tareas → /tasks, los
 * contadores → cada listado, las entregas completas → /deliveries.
 */

/**
 * Etiquetas de estado que significan "ya terminó" y por eso NO cuentan como
 * sesión por realizar. Va en el formato de lista que entiende PostgREST. Ojo:
 * `projects.status` guarda ETIQUETAS del tablero, no el enum — filtrar por
 * 'booked'/'in_progress' daba cero.
 */
const TERMINADAS_PG =
  '("Entregado","Completado","Cancelado","Finalizado total","delivered","completed","cancelled","archived")'

const RD_TZ = "America/Santo_Domingo"

/** Hoy en RD, `YYYY-MM-DD`. */
function hoyRD(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RD_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** `2026-09-06` → `sáb 6 de septiembre`. Anclado a UTC: en RD retrocedería un día. */
function fechaLarga(dia: string): string {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(`${dia.slice(0, 10)}T00:00:00Z`))
}

/** `2026-09-06` → `6 sep`. */
function fechaCorta(dia: string): string {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(`${dia.slice(0, 10)}T00:00:00Z`))
}

/**
 * La hora, solo si de verdad hay una.
 *
 * Media docena de sesiones tienen `00:00:00` guardado, que en este sistema
 * significa "todavía no le puse hora" (es lo que escribe el formulario cuando
 * el campo va vacío). Mostrar "· 00:00" parece una sesión a medianoche.
 */
function horaSiHay(t: string | null): string | null {
  if (!t) return null
  const hhmm = t.slice(0, 5)
  return hhmm === "00:00" ? null : hhmm
}

/** Días entre hoy y esa fecha. Negativo = ya pasó. */
function diasHasta(dia: string): number {
  const a = new Date(`${hoyRD()}T00:00:00Z`).getTime()
  const b = new Date(`${dia.slice(0, 10)}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

/** "hoy", "mañana", "en 5 días", "hace 3 días". */
function cuandoTexto(dia: string): { badge: string; urgent: boolean } {
  const d = diasHasta(dia)
  if (d === 0) return { badge: "Hoy", urgent: true }
  if (d === 1) return { badge: "Mañana", urgent: false }
  if (d < 0)
    return {
      badge: d === -1 ? "Se pasó ayer" : `Se pasó hace ${Math.abs(d)} días`,
      urgent: true,
    }
  return { badge: `En ${d} días`, urgent: d <= 2 }
}

type SesionProxima = {
  id: string
  projectId: string
  title: string
  date: string
  time: string | null
  location: string | null
  detalle: string | null
}

/**
 * Las sesiones que quedan por realizar, de la más cercana a la más lejana.
 *
 * Cuenta las fechas de `project_events` además de `projects.event_date`: una
 * quinceañera con la fiesta en otro día tiene DOS fechas que hay que cubrir, y
 * la de la fiesta puede caer antes que la de otra sesión.
 */
async function proximasSesiones(studioId: string): Promise<SesionProxima[]> {
  const supabase = createSupabaseServerClient()
  const hoy = hoyRD()

  const { data } = await supabase
    .from("projects")
    .select(
      "id, name, event_date, event_time, location, status, client:clients(name)",
    )
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .is("finalized_at" as any, null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .is("cancelled_at" as any, null)
    .not("status", "in", TERMINADAS_PG)
    .order("event_date", { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uno = (v: any) => (Array.isArray(v) ? (v[0] ?? null) : v)
  const proyectos = ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: String(p.id),
    name: String(p.name ?? "Sesión"),
    clientName: (uno(p.client)?.name as string) ?? null,
    eventDate: p.event_date ? String(p.event_date).slice(0, 10) : null,
    eventTime: horaSiHay((p.event_time as string) ?? null),
    location: (p.location as string) ?? null,
  }))
  if (proyectos.length === 0) return []

  // Las fechas extra (la fiesta, una segunda sesión) de esas mismas sesiones.
  const sb = untypedServer()
  const { data: evRaw } = await sb
    .from("project_events")
    .select("id, project_id, name, event_date, event_time, location, is_primary")
    .eq("studio_id", studioId)
    .in(
      "project_id",
      proyectos.map((p) => p.id),
    )
    .gte("event_date", hoy)
  const eventos = (evRaw ?? []) as Array<Record<string, unknown>>
  const conEventos = new Set(eventos.map((e) => String(e.project_id)))

  const salida: SesionProxima[] = []

  for (const e of eventos) {
    const pid = String(e.project_id)
    const proy = proyectos.find((p) => p.id === pid)
    if (!proy) continue
    salida.push({
      id: `ev-${String(e.id)}`,
      projectId: pid,
      title: proy.clientName ?? proy.name,
      date: String(e.event_date).slice(0, 10),
      time: horaSiHay((e.event_time as string) ?? null),
      location: (e.location as string) ?? null,
      detalle: String(e.name ?? ""),
    })
  }

  for (const p of proyectos) {
    // Si la sesión tiene sus fechas en `project_events`, ya salieron arriba.
    if (conEventos.has(p.id)) continue
    if (!p.eventDate || p.eventDate < hoy) continue
    salida.push({
      id: `pr-${p.id}`,
      projectId: p.id,
      title: p.clientName ?? p.name,
      date: p.eventDate,
      time: p.eventTime,
      location: p.location,
      detalle: p.clientName ? p.name : null,
    })
  }

  salida.sort((a, b) =>
    a.date === b.date
      ? (a.time ?? "").localeCompare(b.time ?? "")
      : a.date.localeCompare(b.date),
  )
  return salida
}

/**
 * De estas sesiones, cuáles ya entregaron sus impresiones.
 *
 * El estado "Impresión enviada" del tablero es el que cierra el ciclo: sin
 * esto, una clienta que ya recibió sus fotos impresas seguía apareciendo en
 * "Por imprimir" para siempre.
 */
async function sesionesConImpresionEntregada(
  studioId: string,
  projectIds: string[],
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set()
  // `finalized_at` / `cancelled_at` son columnas nuevas que los tipos
  // generados todavia no conocen.
  const sb = untypedServer()
  const { data } = await sb
    .from("projects")
    .select("id, status, finalized_at, cancelled_at")
    .eq("studio_id", studioId)
    .in("id", [...new Set(projectIds)])
  const out = new Set<string>()
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const estado = String(r.status ?? "").toLowerCase()
    const cerrada =
      r.finalized_at != null ||
      r.cancelled_at != null ||
      estado.includes("impresión enviada") ||
      estado.includes("impresion enviada") ||
      estado === "finalizado total" ||
      estado === "cancelado"
    if (cerrada) out.add(String(r.id))
  }
  return out
}

export default async function DashboardPage() {
  const session = await requireStudioAuth()

  const [unreadNotifications, entregas, actividad, printItems] =
    await Promise.all([
      countUnreadNotifications(session.studioId),
      listUpcomingDeliveriesByTrack(session.studioId, { limit: 6 }).catch(() => ({
        digital: [],
        prints: [],
      })),
      getRecentActivity(session.studioId, 40).catch(() => []),
      listStudioPrintOverview(session.studioId).catch(() => []),
    ])

  const sesiones = await proximasSesiones(session.studioId).catch(() => [])

  // Sesiones cuyas impresiones YA se entregaron: no son pendientes de nada.
  const impresionesYaSalieron = await sesionesConImpresionEntregada(
    session.studioId,
    printItems
      .map((p) => p.projectId)
      .filter((x): x is string => !!x),
  ).catch(() => new Set<string>())

  // ── Impresiones ───────────────────────────────────────────────────────────
  // LISTAS = el estudio ya las imprimió y avisó; están esperando que el cliente
  // pase a buscarlas. POR IMPRIMIR = el cliente ya eligió y la pelota es tuya.
  const yaSalio = (projectId: string | null) =>
    !!projectId && impresionesYaSalieron.has(projectId)
  const listas = printItems.filter((p) => p.readyAt && !yaSalio(p.projectId))
  const porImprimir = printItems.filter(
    (p) =>
      !p.readyAt &&
      !yaSalio(p.projectId) &&
      (p.status === "selected" || p.status === "auto"),
  )

  // Solo lo que pasó con un CLIENTE (lo de adentro del estudio vive en Tareas).
  const actividadClientes = actividad.filter(esDeCliente).slice(0, 18)

  const firstName = (session.name || session.email).split(" ")[0]
  const hoyTexto = new Intl.DateTimeFormat("es-DO", {
    timeZone: RD_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date())

  // ── Próxima entrega digital ───────────────────────────────────────────────
  const [digital0, ...digitalResto] = entregas.digital
  const digitalCuando = digital0?.date ? cuandoTexto(digital0.date) : null

  // ── Próxima sesión ────────────────────────────────────────────────────────
  const [sesion0, ...sesionResto] = sesiones
  const sesionCuando = sesion0 ? cuandoTexto(sesion0.date) : null

  // ── Impresiones listas ────────────────────────────────────────────────────
  const lista0 = listas[0] ?? null

  return (
    <>
      <AppTopbar unreadNotifications={unreadNotifications} />

      <div className="flex flex-col gap-3 px-6 pt-6 pb-2 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-foreground">
            Hola, {firstName}
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground first-letter:uppercase">
            {hoyTexto}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button asChild size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
            <Link href="/projects/new">Nueva sesión</Link>
          </Button>
        </div>
      </div>

      <div className="px-6 pb-12 pt-4 lg:px-8">
        <div className="space-y-5">
          {/* ─── Lo próximo de cada cosa ──────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
            <FocusCard
              eyebrow="Próxima entrega digital"
              tone="azul"
              icon={<Images className="h-3.5 w-3.5" />}
              href="/deliveries"
              hrefLabel="Ver entregas"
              delay={0.04}
              emptyText="No hay entregas de digitales pendientes."
              main={
                digital0
                  ? {
                      title: digital0.title,
                      badge: digitalCuando?.badge ?? null,
                      urgent: digital0.overdue || digitalCuando?.urgent,
                      when: digital0.date ? fechaLarga(digital0.date) : null,
                      detail: digital0.awaitingSelection
                        ? "Estimado — la clienta aún no envía su selección"
                        : digital0.subtitle,
                      href: digital0.href,
                    }
                  : null
              }
              nextLabel="Después"
              nextUp={digitalResto.slice(0, 3).map(
                (d): FocusNext => ({
                  id: d.id,
                  title: d.title,
                  when: d.date ? fechaCorta(d.date) : null,
                  href: d.href,
                  urgent: d.overdue,
                }),
              )}
            />

            <FocusCard
              eyebrow="Próxima sesión a realizar"
              tone="lila"
              icon={<Camera className="h-3.5 w-3.5" />}
              href="/calendar"
              hrefLabel="Ver calendario"
              delay={0.1}
              emptyText="No hay sesiones agendadas por delante."
              main={
                sesion0
                  ? {
                      title: sesion0.title,
                      badge: sesionCuando?.badge ?? null,
                      urgent: sesionCuando?.urgent,
                      when:
                        fechaLarga(sesion0.date) +
                        (sesion0.time ? ` · ${sesion0.time}` : ""),
                      detail:
                        [sesion0.detalle, sesion0.location]
                          .filter(Boolean)
                          .join(" · ") || null,
                      href: `/projects/${sesion0.projectId}`,
                    }
                  : null
              }
              nextLabel="Después"
              nextUp={sesionResto.slice(0, 3).map(
                (s): FocusNext => ({
                  id: s.id,
                  title: s.title,
                  when: fechaCorta(s.date),
                  href: `/projects/${s.projectId}`,
                }),
              )}
            />

            <FocusCard
              eyebrow="Impresiones listas"
              tone="menta"
              icon={<Printer className="h-3.5 w-3.5" />}
              href="/impresiones"
              hrefLabel="Ver impresiones"
              delay={0.16}
              emptyText="Ninguna impresión lista para entregar todavía."
              main={
                lista0
                  ? {
                      title: lista0.clientName ?? lista0.galleryName,
                      badge:
                        listas.length > 1
                          ? `${listas.length} para entregar`
                          : "Lista para entregar",
                      when: lista0.readyAt
                        ? `Lista desde el ${fechaCorta(lista0.readyAt.slice(0, 10))}`
                        : null,
                      detail: lista0.summary,
                      href: lista0.projectId
                        ? `/projects/${lista0.projectId}`
                        : "/impresiones",
                    }
                  : null
              }
              nextLabel={
                porImprimir.length > 0
                  ? `Por imprimir (${porImprimir.length})`
                  : "Por imprimir"
              }
              nextUp={porImprimir.slice(0, 3).map(
                (p): FocusNext => ({
                  id: p.galleryId,
                  title: p.clientName ?? p.galleryName,
                  when:
                    p.status === "auto"
                      ? "automáticas"
                      : p.submittedAt
                        ? fechaCorta(p.submittedAt.slice(0, 10))
                        : null,
                  href: p.projectId ? `/projects/${p.projectId}` : "/impresiones",
                }),
              )}
              footer={
                listas.length > 1 ? (
                  <ul className="space-y-1">
                    {listas.slice(1, 4).map((p) => (
                      <li key={p.galleryId}>
                        <Link
                          href={
                            p.projectId ? `/projects/${p.projectId}` : "/impresiones"
                          }
                          prefetch={false}
                          className="flex items-baseline justify-between gap-3 rounded-md -mx-1 px-1 py-0.5 hover:bg-muted/50"
                        >
                          <span className="truncate text-[12.5px] text-foreground/85">
                            {p.clientName ?? p.galleryName}
                          </span>
                          <span className="shrink-0 text-[11.5px] text-emerald-600 dark:text-emerald-400">
                            lista
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : undefined
              }
            />
          </div>

          {/* ─── Actividad de los clientes ────────────────────────────── */}
          <DashboardCard
            title="Actividad reciente de tus clientes"
            href="/notificaciones"
            hrefLabel="Ver todo"
            delay={0.22}
          >
            <ClientActivityFeed items={actividadClientes} />
          </DashboardCard>
        </div>
      </div>
    </>
  )
}
