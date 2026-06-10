import "server-only"

import { createSupabaseServerClient } from "@/server/supabase/server"

/**
 * Búsqueda global del estudio — alimenta el buscador del topbar.
 *
 * Corre una query acotada por entidad (clients, projects, invoices, leads,
 * galleries, tasks) en paralelo, con `limit` chico por tipo. Cada query es
 * independiente (Promise.allSettled): si una falla, las demás siguen — el
 * buscador nunca se cae entero por una tabla.
 *
 * RLS: usa el server client (JWT del estudio), así que solo devuelve filas del
 * studio del usuario. El `.eq("studio_id", ...)` es defensa en profundidad.
 */

export type SearchResultType =
  | "client"
  | "project"
  | "invoice"
  | "lead"
  | "gallery"
  | "task"

export interface SearchResult {
  type: SearchResultType
  id: string
  label: string
  sublabel: string | null
  href: string
}

export interface SearchGroup {
  type: SearchResultType
  label: string
  results: SearchResult[]
}

export interface GlobalSearchResults {
  query: string
  total: number
  groups: SearchGroup[]
}

const PER_TYPE = 6

const GROUP_LABELS: Record<SearchResultType, string> = {
  client: "Clientes",
  project: "Proyectos",
  invoice: "Facturas",
  lead: "Leads",
  gallery: "Galerías",
  task: "Tareas",
}

function rows<T>(r: PromiseSettledResult<{ data: T[] | null }>): T[] {
  return r.status === "fulfilled" ? r.value.data ?? [] : []
}

export async function globalSearch(
  studioId: string,
  rawQuery: string,
): Promise<GlobalSearchResults> {
  const q = (rawQuery ?? "").trim()
  if (q.length < 2) return { query: q, total: 0, groups: [] }

  const term = `%${q}%`
  // Cast a any: consultamos tablas por nombre dinámico (el cliente tipado exige
  // literales de la unión de tablas). Sigue siendo el server client con JWT del
  // estudio → RLS intacto; el .eq("studio_id", …) es defensa en profundidad.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createSupabaseServerClient() as any

  const scoped = (table: string, cols: string) =>
    supabase.from(table).select(cols).eq("studio_id", studioId).is("deleted_at", null)

  const [clients, projects, invoices, leads, galleries, tasks] =
    await Promise.allSettled([
      scoped("clients", "id, name, email")
        .or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
        .order("name", { ascending: true })
        .limit(PER_TYPE),
      scoped("projects", "id, name, status")
        .ilike("name", term)
        .order("created_at", { ascending: false })
        .limit(PER_TYPE),
      scoped("invoices", "id, invoice_number, status")
        .ilike("invoice_number", term)
        .order("created_at", { ascending: false })
        .limit(PER_TYPE),
      scoped("leads", "id, name, email")
        .or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
        .order("created_at", { ascending: false })
        .limit(PER_TYPE),
      scoped("galleries", "id, name")
        .ilike("name", term)
        .order("created_at", { ascending: false })
        .limit(PER_TYPE),
      scoped("tasks", "id, title, status")
        .or(`title.ilike.${term},description.ilike.${term}`)
        .order("created_at", { ascending: false })
        .limit(PER_TYPE),
    ])

  const groups: SearchGroup[] = []

  const clientResults: SearchResult[] = rows<{
    id: string
    name: string
    email: string | null
  }>(clients as PromiseSettledResult<{ data: any[] | null }>).map((c) => ({
    type: "client",
    id: c.id,
    label: c.name,
    sublabel: c.email,
    href: `/clients/${c.id}`,
  }))
  if (clientResults.length)
    groups.push({ type: "client", label: GROUP_LABELS.client, results: clientResults })

  const projectResults: SearchResult[] = rows<{
    id: string
    name: string
    status: string | null
  }>(projects as PromiseSettledResult<{ data: any[] | null }>).map((p) => ({
    type: "project",
    id: p.id,
    label: p.name,
    sublabel: p.status,
    href: `/projects/${p.id}`,
  }))
  if (projectResults.length)
    groups.push({ type: "project", label: GROUP_LABELS.project, results: projectResults })

  const invoiceResults: SearchResult[] = rows<{
    id: string
    invoice_number: string | null
    status: string | null
  }>(invoices as PromiseSettledResult<{ data: any[] | null }>).map((i) => ({
    type: "invoice",
    id: i.id,
    label: i.invoice_number ?? "Factura",
    sublabel: i.status,
    href: `/invoices/${i.id}`,
  }))
  if (invoiceResults.length)
    groups.push({ type: "invoice", label: GROUP_LABELS.invoice, results: invoiceResults })

  const leadResults: SearchResult[] = rows<{
    id: string
    name: string
    email: string | null
  }>(leads as PromiseSettledResult<{ data: any[] | null }>).map((l) => ({
    type: "lead",
    id: l.id,
    label: l.name,
    sublabel: l.email,
    href: `/leads/${l.id}`,
  }))
  if (leadResults.length)
    groups.push({ type: "lead", label: GROUP_LABELS.lead, results: leadResults })

  const galleryResults: SearchResult[] = rows<{ id: string; name: string }>(
    galleries as PromiseSettledResult<{ data: any[] | null }>,
  ).map((g) => ({
    type: "gallery",
    id: g.id,
    label: g.name,
    sublabel: null,
    href: `/galleries/${g.id}`,
  }))
  if (galleryResults.length)
    groups.push({ type: "gallery", label: GROUP_LABELS.gallery, results: galleryResults })

  const taskResults: SearchResult[] = rows<{
    id: string
    title: string
    status: string | null
  }>(tasks as PromiseSettledResult<{ data: any[] | null }>).map((t) => ({
    type: "task",
    id: t.id,
    label: t.title,
    sublabel: t.status,
    href: `/tasks`,
  }))
  if (taskResults.length)
    groups.push({ type: "task", label: GROUP_LABELS.task, results: taskResults })

  const total = groups.reduce((acc, g) => acc + g.results.length, 0)
  return { query: q, total, groups }
}
