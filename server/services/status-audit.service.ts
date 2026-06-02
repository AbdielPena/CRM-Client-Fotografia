import "server-only"

import { createSupabaseServerClient } from "@/server/supabase/server"
import { createSupabaseServiceClient } from "@/server/supabase/service"

/**
 * Motor de auditoría automática del módulo /status. Ejecuta sondas reales
 * contra DB, Auth, datos por módulo e integraciones, y devuelve el estado de
 * cada sonda. Best-effort: ninguna sonda lanza; los fallos se reportan como
 * 'error'/'warning'.
 */

export type ProbeStatus = "ok" | "warning" | "error" | "unchecked"

export interface ProbeResult {
  key: string
  label: string
  status: ProbeStatus
  message: string
}

export interface AuditResult {
  results: ProbeResult[]
  summary: {
    ok: number
    warning: number
    error: number
    unchecked: number
    total: number
  }
}

async function countTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  studioId: string,
): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
    if (error) return null
    return count ?? 0
  } catch {
    return null
  }
}

export async function runAudit(studioId: string): Promise<AuditResult> {
  const supabase = createSupabaseServerClient()
  const svc = createSupabaseServiceClient()
  const results: ProbeResult[] = []
  const add = (key: string, label: string, status: ProbeStatus, message: string) =>
    results.push({ key, label, status, message })

  // ── Base de datos ──
  try {
    const { error } = await supabase
      .from("studios")
      .select("id", { count: "exact", head: true })
      .eq("id", studioId)
    add("database", "Base de datos", error ? "error" : "ok", error ? error.message : "Conexión OK")
  } catch (e) {
    add("database", "Base de datos", "error", e instanceof Error ? e.message : "fallo")
  }

  // ── Auth ──
  const members = await countTable(supabase, "studio_members", studioId)
  add(
    "auth",
    "Autenticación",
    members === null ? "error" : members >= 1 ? "ok" : "warning",
    members === null ? "No se pudo leer miembros" : `${members} miembro(s) del studio`,
  )

  // ── Datos por módulo (presencia + tabla accesible) ──
  const dataProbes: Array<[string, string, string]> = [
    ["clients", "Clientes", "clients"],
    ["projects", "Proyectos", "projects"],
    ["bookings", "Solicitudes (Booking)", "booking_requests"],
    ["contracts", "Contratos", "contracts"],
    ["forms", "Formularios", "form_responses"],
    ["invoices", "Facturación", "invoices"],
    ["deliveries", "Entregas", "client_deliveries"],
  ]
  await Promise.all(
    dataProbes.map(async ([key, label, table]) => {
      const n = await countTable(supabase, table, studioId)
      add(key, label, n === null ? "error" : "ok", n === null ? "Tabla inaccesible" : `${n} registro(s)`)
    }),
  )

  // ── Fiscal (NCF) ──
  const fiscalCount = await countTable(svc, "fiscal_ncf_sequences", studioId)
  add(
    "fiscal",
    "Fiscal RD (NCF)",
    fiscalCount === null ? "unchecked" : fiscalCount > 0 ? "ok" : "unchecked",
    fiscalCount === null
      ? "No configurado"
      : fiscalCount > 0
        ? `${fiscalCount} secuencia(s)`
        : "Sin secuencias NCF",
  )

  // ── Correo / SMTP ──
  const smtpReady = !!process.env.SMTP_HOST && !!process.env.SMTP_USER
  let mailFailed: number | null = null
  try {
    const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString()
    const { count } = await supabase
      .from("email_queue")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .eq("status", "failed")
      .gte("created_at", since)
    mailFailed = count ?? 0
  } catch {
    mailFailed = null
  }
  if (!smtpReady) {
    add("mail", "Correo (SMTP)", "warning", "SMTP no configurado: los correos no se envían")
  } else if ((mailFailed ?? 0) > 0) {
    add("mail", "Correo (SMTP)", "warning", `${mailFailed} correo(s) fallidos en 7 días`)
  } else {
    add("mail", "Correo (SMTP)", "ok", "SMTP configurado, sin fallos recientes")
  }

  // ── Google Calendar ──
  try {
    const { getGoogleCalendarStatus } = await import("./google-calendar.service")
    const st = await getGoogleCalendarStatus(studioId)
    if (!st.enabled) {
      add("google_calendar", "Google Calendar", "unchecked", "No conectado (opcional)")
    } else if (!st.calendarId) {
      add("google_calendar", "Google Calendar", "warning", "Conectado pero sin calendario activo")
    } else {
      add("google_calendar", "Google Calendar", "ok", `Conectado (${st.email ?? "cuenta"})`)
    }
  } catch {
    add("google_calendar", "Google Calendar", "unchecked", "No disponible")
  }

  // ── Stripe (env) ──
  add(
    "stripe",
    "Pagos online (Stripe)",
    process.env.STRIPE_SECRET_KEY ? "ok" : "unchecked",
    process.env.STRIPE_SECRET_KEY ? "Configurado" : "No configurado (opcional)",
  )

  // ── pg_cron (recordatorios de entregas) ──
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (svc as any).rpc("status_cron_active", {
      p_jobname: "delivery-reminders-daily",
    })
    add(
      "cron",
      "Tareas programadas (cron)",
      error ? "warning" : data ? "ok" : "warning",
      error ? "No verificable" : data ? "Job de recordatorios activo" : "Job de recordatorios inactivo",
    )
  } catch {
    add("cron", "Tareas programadas (cron)", "warning", "No verificable")
  }

  // ── Storage ──
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc as any).storage.listBuckets()
    add("storage", "Almacenamiento", error ? "warning" : "ok", error ? "No accesible" : "Storage accesible")
  } catch {
    add("storage", "Almacenamiento", "unchecked", "No verificable")
  }

  // ── API tokens ──
  const apiCount = await countTable(svc, "api_keys", studioId)
  if (apiCount === null) {
    add("api", "API y tokens", "unchecked", "Sin verificación")
  } else {
    add("api", "API y tokens", "ok", `${apiCount} token(s)`)
  }

  const summary = {
    ok: results.filter((r) => r.status === "ok").length,
    warning: results.filter((r) => r.status === "warning").length,
    error: results.filter((r) => r.status === "error").length,
    unchecked: results.filter((r) => r.status === "unchecked").length,
    total: results.length,
  }

  return { results, summary }
}
