/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pre-migration audit — corre antes de aplicar cualquier migration destructiva.
 *
 * Output:
 *   - Counts por tabla (todas las tablas del studio activo)
 *   - Sum(amount) total por tabla monetaria
 *   - JSON guardado en `./audit-<timestamp>.json` para diff post-migration
 *
 * Uso:
 *   pnpm tsx scripts/pre-migration-audit.ts <studio_id>
 *   (lee credentials de .env.production)
 *
 * Post-migration:
 *   pnpm tsx scripts/pre-migration-audit.ts <studio_id> --compare ./audit-<ts>.json
 *   (compara nuevos counts con el snapshot)
 */
import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "❌ Define NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY",
  )
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const STUDIO_TABLES_WITH_SUM = [
  // Tablas con monto/total — sum(amount)/sum(total) reportado
  ["invoices", "total"],
  ["payments", "amount"],
  ["fin_transactions", "monto"],
  ["fin_payables", "amount"],
  ["fin_receivables", "amount"],
  ["fin_debts", "monto_original"],
  ["fin_loans", "monto_original"],
  ["fin_goals", "monto_objetivo"],
  ["fin_subscriptions", "monto"],
  ["fin_tithe", "monto_diezmo"],
  ["inv_rentals", "total_amount"],
  ["inv_rental_payments", "amount"],
  ["inv_maintenance_records", "cost"],
] as const

const STUDIO_TABLES_COUNT_ONLY = [
  // Solo count(*)
  "clients",
  "leads",
  "projects",
  "contacts",
  "bookings",
  "tasks",
  "notes",
  "tags",
  "contracts",
  "proposals",
  "galleries",
  "gallery_assets",
  "deliveries",
  "notifications",
  "activity_log",
  "email_logs",
  "fin_accounts",
  "fin_categories",
  "fin_beneficiaries",
  "fin_cards",
  "fin_banks",
  "fin_debt_payments",
  "fin_loan_payments",
  "fin_goal_contributions",
  "fin_subscription_charges",
  "inv_items",
  "inv_item_units",
  "inv_categories",
  "inv_locations",
  "inv_loans",
  "inv_loan_items",
  "inv_rental_items",
  "inv_reservations",
  "inv_reservation_items",
  "inv_stock_movements",
  "inv_internal_responsibles",
  "mail_accounts",
  "mail_threads",
  "mail_messages",
  "mail_attachments",
  "mail_bounce_events",
  "fiscal_ncf_sequences",
] as const

type AuditSnapshot = {
  studioId: string
  takenAt: string
  counts: Record<string, number>
  sums: Record<string, { count: number; sum: number }>
  errors: Array<{ table: string; error: string }>
}

async function runAudit(studioId: string): Promise<AuditSnapshot> {
  const snapshot: AuditSnapshot = {
    studioId,
    takenAt: new Date().toISOString(),
    counts: {},
    sums: {},
    errors: [],
  }

  // Count-only tables
  for (const tbl of STUDIO_TABLES_COUNT_ONLY) {
    try {
      const { count, error } = await (sb.from(tbl) as any)
        .select("*", { count: "exact", head: true })
        .eq("studio_id", studioId)
      if (error) throw error
      snapshot.counts[tbl] = count ?? 0
      process.stdout.write(`  ${tbl.padEnd(35)}: ${count ?? 0}\n`)
    } catch (err) {
      snapshot.errors.push({
        table: tbl,
        error: err instanceof Error ? err.message : "Unknown",
      })
      process.stdout.write(`  ${tbl.padEnd(35)}: ❌ ${err}\n`)
    }
  }

  // Sum tables
  for (const [tbl, col] of STUDIO_TABLES_WITH_SUM) {
    try {
      const { data, error, count } = await (sb.from(tbl) as any)
        .select(col, { count: "exact" })
        .eq("studio_id", studioId)
      if (error) throw error
      const sum = ((data ?? []) as Array<Record<string, number | string>>)
        .reduce((acc, r) => acc + Number(r[col] ?? 0), 0)
      snapshot.sums[tbl] = { count: count ?? 0, sum }
      process.stdout.write(
        `  ${tbl.padEnd(35)}: ${count ?? 0} rows / sum(${col})=${sum.toFixed(2)}\n`,
      )
    } catch (err) {
      snapshot.errors.push({
        table: tbl,
        error: err instanceof Error ? err.message : "Unknown",
      })
      process.stdout.write(`  ${tbl.padEnd(35)}: ❌ ${err}\n`)
    }
  }

  return snapshot
}

function compareSnapshots(
  before: AuditSnapshot,
  after: AuditSnapshot,
): { changed: number; deltas: Array<{ table: string; before: any; after: any }> } {
  const deltas: Array<{ table: string; before: any; after: any }> = []

  for (const tbl of Object.keys(before.counts)) {
    if (before.counts[tbl] !== after.counts[tbl]) {
      deltas.push({
        table: tbl,
        before: before.counts[tbl],
        after: after.counts[tbl] ?? 0,
      })
    }
  }
  for (const tbl of Object.keys(before.sums)) {
    const b = before.sums[tbl]
    const a = after.sums[tbl]
    if (!a || b.count !== a.count || Math.abs(b.sum - a.sum) > 0.01) {
      deltas.push({
        table: tbl,
        before: b,
        after: a ?? { count: 0, sum: 0 },
      })
    }
  }

  return { changed: deltas.length, deltas }
}

async function main() {
  const studioId = process.argv[2]
  if (!studioId) {
    console.error("Uso: tsx scripts/pre-migration-audit.ts <studio_id> [--compare <file>]")
    process.exit(1)
  }

  console.log(`📊 Auditando studio ${studioId}\n`)
  const snapshot = await runAudit(studioId)

  const compareIdx = process.argv.indexOf("--compare")
  if (compareIdx > 0 && process.argv[compareIdx + 1]) {
    const beforeRaw = fs.readFileSync(process.argv[compareIdx + 1], "utf-8")
    const before = JSON.parse(beforeRaw) as AuditSnapshot
    console.log("\n🔍 Comparando con snapshot previo...\n")
    const result = compareSnapshots(before, snapshot)
    if (result.changed === 0) {
      console.log("✅ Sin cambios — counts y sums match perfectamente")
    } else {
      console.log(`⚠️  ${result.changed} tablas con diferencias:\n`)
      for (const d of result.deltas) {
        console.log(
          `  ${d.table}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`,
        )
      }
    }
  } else {
    const outFile = path.resolve(
      process.cwd(),
      `audit-${Date.now()}.json`,
    )
    fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2))
    console.log(`\n💾 Snapshot guardado: ${outFile}`)
    console.log(
      "Para comparar después: pnpm tsx scripts/pre-migration-audit.ts " +
        `${studioId} --compare ${outFile}`,
    )
  }
}

main().catch((err) => {
  console.error("Audit failed:", err)
  process.exit(1)
})
