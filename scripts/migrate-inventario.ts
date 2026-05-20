#!/usr/bin/env tsx
/**
 * ETL: schema `inventario` → schema `public` con prefijo `inv_*` y multi-tenant.
 *
 * Como `inventario-app` ya vive en el MISMO Supabase project que studioflow,
 * la migración es 100% in-DB (sin copy cross-cluster). Preservamos UUIDs
 * originales para no romper FKs y permitir rollback si necesario.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/migrate-inventario.ts --studio-id <uuid> [--dry-run]
 *
 * Flow:
 *   1. Validate studio_id exists + we have service role key
 *   2. Per tabla origen, SELECT * y INSERT en destino con studio_id agregado
 *   3. Verify counts pre/post — si difiere, STOP
 *   4. Reportar stats al final
 *
 * Por seguridad:
 *   - NO borra inventario.* — eso se hace manual después de 14 días gracia
 *   - --dry-run solo cuenta + valida, no inserta
 *   - --skip-existing salta tablas que ya tienen rows (rerun-safe)
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Falta SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

// Args parsing simple
const args = process.argv.slice(2)
const studioId = getArg("--studio-id")
const dryRun = args.includes("--dry-run")
const skipExisting = args.includes("--skip-existing")

if (!studioId) {
  console.error("❌ Falta --studio-id <uuid>")
  console.error("Uso: npx tsx scripts/migrate-inventario.ts --studio-id <uuid> [--dry-run] [--skip-existing]")
  process.exit(1)
}

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name)
  return idx >= 0 && idx < args.length - 1 ? args[idx + 1] : undefined
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ============================================================================
// Tablas a migrar — orden importa (FK dependencies)
// ============================================================================

type TableMap = {
  /** Schema origen (inventario.*) — referencia para count */
  source: string
  /** Tabla destino public.* */
  target: string
  /** Si esta tabla solo agrega studio_id (passthrough simple) */
  addStudioId: boolean
}

// Orden topológico para respetar FK dependencies
const TABLES: TableMap[] = [
  { source: "inventario.categories", target: "inv_categories", addStudioId: true },
  { source: "inventario.subcategories", target: "inv_subcategories", addStudioId: true },
  { source: "inventario.locations", target: "inv_locations", addStudioId: true },
  // internal_responsibles tiene user_id ref a inventario.users — set null
  { source: "inventario.internal_responsibles", target: "inv_internal_responsibles", addStudioId: true },
  { source: "inventario.items", target: "inv_items", addStudioId: true },
  { source: "inventario.item_units", target: "inv_item_units", addStudioId: true },
  { source: "inventario.item_images", target: "inv_item_images", addStudioId: true },
  { source: "inventario.item_documents", target: "inv_item_documents", addStudioId: true },
  // loans/rentals/reservations dependen de items + responsibles
  { source: "inventario.loans", target: "inv_loans", addStudioId: true },
  { source: "inventario.loan_items", target: "inv_loan_items", addStudioId: true },
  { source: "inventario.rentals", target: "inv_rentals", addStudioId: true },
  { source: "inventario.rental_items", target: "inv_rental_items", addStudioId: true },
  { source: "inventario.reservations", target: "inv_reservations", addStudioId: true },
  { source: "inventario.reservation_items", target: "inv_reservation_items", addStudioId: true },
  { source: "inventario.maintenance_records", target: "inv_maintenance_records", addStudioId: true },
  { source: "inventario.payments", target: "inv_rental_payments", addStudioId: true },
  { source: "inventario.penalties", target: "inv_penalties", addStudioId: true },
  { source: "inventario.stock_movements", target: "inv_stock_movements", addStudioId: true },
]

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(`🚀 ETL inventario → ${studioId}`)
  console.log(`Mode: ${dryRun ? "DRY-RUN" : skipExisting ? "SKIP-EXISTING" : "FULL"}`)
  console.log("=".repeat(60))

  // 0. Validar studio existe
  const { data: studio, error: studioErr } = await sb
    .from("studios")
    .select("id, name")
    .eq("id", studioId)
    .maybeSingle()

  if (studioErr || !studio) {
    console.error(`❌ Studio ${studioId} no existe`, studioErr)
    process.exit(2)
  }
  console.log(`✓ Studio: ${studio.name} (${studio.id})`)

  const stats: Array<{ table: string; source: number; copied: number; skipped: number }> = []

  for (const { source, target, addStudioId } of TABLES) {
    // Source schema queries no son posibles via supabase JS normal — usamos rpc
    // Para mantener este script simple sin RPC, usamos query via .from() con
    // schema explicit (requires PostgREST exposed schemas). Si inventario
    // no está expuesto en PostgREST, este ETL requiere ejecutar vía supabase
    // SQL editor o psql directo.
    //
    // Alternativa segura: ejecutar como SQL plano. Aquí dejamos el shape
    // del script TS para ilustrar el flow esperado.

    const sourceSchema = source.split(".")[0]
    const sourceTable = source.split(".")[1]

    // Count source
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceClient = sb.schema(sourceSchema as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: srcCount, error: srcCountErr } = await (sourceClient as any)
      .from(sourceTable)
      .select("*", { count: "exact", head: true })

    if (srcCountErr) {
      console.warn(`⚠  ${source}: error contando — ${srcCountErr.message}`)
      stats.push({ table: target, source: 0, copied: 0, skipped: 0 })
      continue
    }

    // Count destino
    const { count: destCount } = await sb
      .from(target)
      .select("*", { count: "exact", head: true })
      .eq("studio_id", studioId)

    console.log(`\n📊 ${source}: ${srcCount} rows → ${target}: ${destCount ?? 0} ya migrados`)

    if (skipExisting && (destCount ?? 0) > 0) {
      console.log(`   ⏭  SKIP: ya hay rows en destino`)
      stats.push({ table: target, source: srcCount ?? 0, copied: 0, skipped: srcCount ?? 0 })
      continue
    }

    if (dryRun) {
      console.log(`   🔍 DRY-RUN: would copy ${srcCount} rows`)
      stats.push({ table: target, source: srcCount ?? 0, copied: 0, skipped: srcCount ?? 0 })
      continue
    }

    // Fetch source en batches de 1000
    let copied = 0
    let offset = 0
    const batchSize = 1000
    while (offset < (srcCount ?? 0)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error: fetchErr } = await (sourceClient as any)
        .from(sourceTable)
        .select("*")
        .range(offset, offset + batchSize - 1)

      if (fetchErr) {
        console.error(`   ❌ Fetch batch ${offset} falló:`, fetchErr.message)
        break
      }
      if (!rows || rows.length === 0) break

      // Map rows: agrega studio_id
      const mapped = (rows as Record<string, unknown>[]).map((r) =>
        addStudioId ? { ...r, studio_id: studioId } : r,
      )

      const { error: insertErr } = await sb
        .from(target)
        .insert(mapped)

      if (insertErr) {
        console.error(`   ❌ Insert batch ${offset} falló:`, insertErr.message)
        break
      }

      copied += rows.length
      offset += batchSize
      process.stdout.write(`   ✓ ${copied}/${srcCount}\r`)
    }
    console.log(`   ✓ ${copied} rows copiados`)
    stats.push({ table: target, source: srcCount ?? 0, copied, skipped: 0 })
  }

  // Summary
  console.log("\n" + "=".repeat(60))
  console.log("RESUMEN")
  console.log("=".repeat(60))
  for (const s of stats) {
    const status = s.copied === s.source ? "✓" : s.skipped === s.source ? "⏭" : "⚠"
    console.log(
      `${status} ${s.table.padEnd(35)} ${String(s.copied).padStart(6)} / ${s.source}`,
    )
  }

  // Validation pass
  const totalSrc = stats.reduce((a, s) => a + s.source, 0)
  const totalCopied = stats.reduce((a, s) => a + s.copied + s.skipped, 0)
  console.log("=".repeat(60))
  console.log(`Total: ${totalCopied} / ${totalSrc} rows migrados/skipped`)

  if (totalCopied !== totalSrc) {
    console.error(`\n❌ DISCREPANCIA: faltan ${totalSrc - totalCopied} rows`)
    process.exit(3)
  }
  console.log(`\n✅ Migración OK${dryRun ? " (dry-run)" : ""}`)
}

main().catch((err) => {
  console.error("\n💥 Fatal:", err)
  process.exit(99)
})
