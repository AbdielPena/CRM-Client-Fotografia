#!/usr/bin/env tsx
/**
 * ETL: Postgres local (finanzapp) → Supabase (studioflow monolito).
 *
 * Cross-cluster: lee de PG local del usuario, escribe en Supabase del monolito.
 *
 * Uso:
 *   DATABASE_URL_FINANZAPP=postgres://postgres:postgres@localhost:5432/finanzapp \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/migrate-finanzapp.ts --studio-id <uuid> --workspace-id <wsid> [--dry-run]
 *
 * Args:
 *   --studio-id <uuid>     studio destino en Supabase
 *   --workspace-id <uuid>  workspace origen en finanzapp (1 workspace → 1 studio)
 *   --dry-run             solo cuenta + valida, no inserta
 *   --skip-existing       salta tablas ya migradas
 *
 * Mapping clave:
 *   finanzapp.workspaces → asumimos 1 workspace por studio (el script requiere
 *     --workspace-id explícito para escoger cuál migrar si el user tiene varios)
 *   workspace_id → studio_id en TODAS las rows
 *   Tablas → fin_* con prefijo
 */

import { createClient } from "@supabase/supabase-js"
// Dynamic import de pg para no romper si no está instalado.
// Type any porque pg no es dependencia hard del repo — el script TS pasa
// typecheck sin pg instalado; al ejecutarlo, `npm install pg @types/pg`.
/* eslint-disable @typescript-eslint/no-explicit-any */
let pg: any = null

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const FINANZAPP_DB = process.env.DATABASE_URL_FINANZAPP

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Falta SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
if (!FINANZAPP_DB) {
  console.error("❌ Falta DATABASE_URL_FINANZAPP (PG local de finanzapp)")
  console.error("   Ejemplo: postgres://postgres:postgres@localhost:5432/finanzapp")
  process.exit(1)
}

const args = process.argv.slice(2)
function getArg(name: string): string | undefined {
  const idx = args.indexOf(name)
  return idx >= 0 && idx < args.length - 1 ? args[idx + 1] : undefined
}
const studioId = getArg("--studio-id")
const workspaceId = getArg("--workspace-id")
const dryRun = args.includes("--dry-run")
const skipExisting = args.includes("--skip-existing")

if (!studioId || !workspaceId) {
  console.error("❌ Faltan --studio-id <uuid> y/o --workspace-id <uuid>")
  process.exit(1)
}

// ============================================================================
// Mapping tablas
// ============================================================================

type ColumnMap = Record<string, string>

type TableConfig = {
  /** Tabla en finanzapp PG */
  source: string
  /** Tabla destino en Supabase (sin prefix `public.`) */
  target: string
  /** Mapping de columnas: origen → destino (si difieren). Si no, se preserva. */
  columnMap?: ColumnMap
  /** Columnas a excluir (no copiar al destino) */
  exclude?: string[]
  /** Replace workspace_id → studio_id (default true) */
  replaceWorkspace?: boolean
}

const TABLES: TableConfig[] = [
  // Core
  {
    source: "banks",
    target: "fin_banks",
    columnMap: { nombre: "nombre" }, // ya es nombre, no cambia
    exclude: ["id"], // Mantener IDs originales (no excluir realmente — lo dejo para que regenere si conflict)
  },
  {
    source: "accounts",
    target: "fin_accounts",
    columnMap: { banco_id: "banco_id", saldo_inicial: "saldo_inicial" },
  },
  {
    source: "cards",
    target: "fin_cards",
  },
  {
    source: "external_cards",
    target: "fin_external_cards",
  },
  {
    source: "categories",
    target: "fin_categories",
    // is_business: agregar default true para legacy data
  },
  {
    source: "beneficiaries",
    target: "fin_beneficiaries",
  },
  // Heart
  {
    source: "transactions",
    target: "fin_transactions",
    // El monolito tiene columnas invoice_id, client_id, external_reference,
    // is_business — para legacy data:
    //   - is_business default true (assume todo finanzapp es business si workspace.mode='BUSINESS')
    //   - invoice_id/client_id quedan null (no había vinculación al CRM antes)
    //   - external_reference se preserva si existe (de hub_integration migration)
  },
  // Recurrencia
  { source: "subscriptions", target: "fin_subscriptions" },
  { source: "subscription_charges", target: "fin_subscription_charges" },
  // Deudas + préstamos
  { source: "debts", target: "fin_debts" },
  { source: "debt_payments", target: "fin_debt_payments" },
  { source: "debt_templates", target: "fin_debt_templates" },
  { source: "loans", target: "fin_loans" },
  { source: "loan_payments", target: "fin_loan_payments" },
  // CxC/CxP
  { source: "receivables", target: "fin_receivables" },
  { source: "payables", target: "fin_payables" },
  // Metas
  { source: "goals", target: "fin_goals" },
  { source: "goal_contributions", target: "fin_goal_contributions" },
  { source: "tithe", target: "fin_tithe" },
]

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(`🚀 ETL finanzapp → studio ${studioId}`)
  console.log(`   Source workspace: ${workspaceId}`)
  console.log(`   Mode: ${dryRun ? "DRY-RUN" : skipExisting ? "SKIP-EXISTING" : "FULL"}`)
  console.log("=".repeat(60))

  // Import pg dinámicamente
  try {
    // @ts-expect-error pg no es dependencia hard del repo, se instala bajo demanda
    pg = await import("pg")
  } catch {
    console.error("❌ Module 'pg' no instalado. npm install pg @types/pg")
    process.exit(1)
  }

  // Conexión a PG local
  const pgClient = new pg.Client({ connectionString: FINANZAPP_DB })
  await pgClient.connect()
  console.log("✓ Conexión PG local OK")

  // Conexión Supabase
  const sb = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Validar studio existe
  const { data: studio } = await sb
    .from("studios")
    .select("id, name")
    .eq("id", studioId)
    .maybeSingle()

  if (!studio) {
    console.error(`❌ Studio ${studioId} no existe en Supabase`)
    await pgClient.end()
    process.exit(2)
  }
  console.log(`✓ Studio destino: ${studio.name}`)

  // Validar workspace existe
  const wsRes = await pgClient.query(
    `SELECT id, nombre FROM workspaces WHERE id = $1`,
    [workspaceId],
  )
  if (wsRes.rowCount === 0) {
    console.error(`❌ Workspace ${workspaceId} no existe en finanzapp`)
    await pgClient.end()
    process.exit(2)
  }
  console.log(`✓ Workspace origen: ${wsRes.rows[0].nombre}`)

  const stats: Array<{ table: string; source: number; copied: number; skipped: number }> = []

  for (const cfg of TABLES) {
    const { source, target } = cfg

    // Count en finanzapp
    const countRes = await pgClient.query(
      `SELECT count(*)::int AS n FROM ${source} WHERE workspace_id = $1`,
      [workspaceId],
    )
    const srcCount = countRes.rows[0].n as number

    // Count en Supabase (ya migrado)
    const { count: destCount } = await sb
      .from(target)
      .select("*", { count: "exact", head: true })
      .eq("studio_id", studioId)

    console.log(`\n📊 ${source}: ${srcCount} → ${target}: ${destCount ?? 0} ya migrados`)

    if (skipExisting && (destCount ?? 0) > 0) {
      console.log(`   ⏭  SKIP`)
      stats.push({ table: target, source: srcCount, copied: 0, skipped: srcCount })
      continue
    }

    if (dryRun) {
      console.log(`   🔍 DRY-RUN: would copy ${srcCount}`)
      stats.push({ table: target, source: srcCount, copied: 0, skipped: srcCount })
      continue
    }

    // Fetch en batches
    let copied = 0
    let offset = 0
    const batchSize = 1000
    while (offset < srcCount) {
      const res = await pgClient.query(
        `SELECT * FROM ${source} WHERE workspace_id = $1 ORDER BY created_at LIMIT $2 OFFSET $3`,
        [workspaceId, batchSize, offset],
      )

      if (res.rows.length === 0) break

      // Map: workspace_id → studio_id, agregar is_business si falta
      const mapped = res.rows.map((r: Record<string, unknown>) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { workspace_id: _ws, ...rest } = r
        const result: Record<string, unknown> = { ...rest, studio_id: studioId }
        // Para tablas que necesitan is_business pero no lo tienen en source
        if (target === "fin_transactions" && result.is_business === undefined) {
          result.is_business = true
        }
        if (target === "fin_categories" && result.is_business === undefined) {
          result.is_business = true
        }
        // currency default si falta
        if (
          (target === "fin_accounts" ||
            target === "fin_transactions" ||
            target === "fin_debts" ||
            target === "fin_loans" ||
            target === "fin_receivables" ||
            target === "fin_payables") &&
          !result.currency
        ) {
          result.currency = "DOP"
        }
        return result
      })

      const { error: insertErr } = await sb.from(target).insert(mapped)

      if (insertErr) {
        console.error(`   ❌ Insert batch ${offset} falló:`, insertErr.message)
        break
      }

      copied += res.rows.length
      offset += batchSize
      process.stdout.write(`   ✓ ${copied}/${srcCount}\r`)
    }
    console.log(`   ✓ ${copied} rows copiados`)
    stats.push({ table: target, source: srcCount, copied, skipped: 0 })
  }

  await pgClient.end()

  // Summary
  console.log("\n" + "=".repeat(60))
  console.log("RESUMEN")
  console.log("=".repeat(60))
  for (const s of stats) {
    const status = s.copied === s.source ? "✓" : s.skipped === s.source ? "⏭" : "⚠"
    console.log(
      `${status} ${s.table.padEnd(30)} ${String(s.copied).padStart(6)} / ${s.source}`,
    )
  }

  const totalSrc = stats.reduce((a, s) => a + s.source, 0)
  const totalDone = stats.reduce((a, s) => a + s.copied + s.skipped, 0)
  console.log("=".repeat(60))
  console.log(`Total: ${totalDone} / ${totalSrc} rows`)

  if (totalDone !== totalSrc) {
    console.error(`\n❌ DISCREPANCIA: ${totalSrc - totalDone} rows missing`)
    process.exit(3)
  }
  console.log(`\n✅ Migración OK${dryRun ? " (dry-run)" : ""}`)
  console.log(`\n⚠  Recordatorio: NO borres finanzapp DB hasta 14 días post-switchover`)
}

main().catch((err) => {
  console.error("\n💥 Fatal:", err)
  process.exit(99)
})
