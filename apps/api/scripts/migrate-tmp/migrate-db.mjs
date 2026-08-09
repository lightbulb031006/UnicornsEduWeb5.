/**
 * Database Merge Migration Script
 *
 * Merges ALL data from old Supabase database into new Supabase database
 * using INSERT ... ON CONFLICT (id) DO NOTHING strategy.
 *
 * Usage (from apps/api):
 *   node scripts/migrate-db.mjs                  # real migration
 *   node scripts/migrate-db.mjs --dry-run        # preview only
 *
 * Requires: scripts/.env.migration with OLD_DATABASE_URL and NEW_DATABASE_URL
 */

import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.migration manually (no dotenv dependency needed)
const envPath = path.resolve(__dirname, ".env.migration");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 100;

const OLD_DB_URL = process.env.OLD_DATABASE_URL;
const NEW_DB_URL = process.env.NEW_DATABASE_URL;

if (!OLD_DB_URL || !NEW_DB_URL) {
  console.error(
    "❌ Missing OLD_DATABASE_URL or NEW_DATABASE_URL in scripts/.env.migration"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Table definitions in FK-dependency order
// ---------------------------------------------------------------------------

const TABLES = [
  // Phase 1 — Foundational
  { table: "users", pk: ["id"] },
  { table: "survey_round", pk: ["id"] },

  // Phase 2 — People
  { table: "staff_info", pk: ["id"] },
  { table: "student_info", pk: ["id"] },

  // Phase 3 — Classes & relationships
  { table: "classes", pk: ["id"] },
  { table: "class_teachers", pk: ["id"] },
  { table: "student_classes", pk: ["id"] },

  // Phase 4 — Sessions & related
  { table: "sessions", pk: ["id"] },
  { table: "makeup_schedule_events", pk: ["id"] },
  { table: "missed_teaching_explanations", pk: ["id"] },

  // Phase 5 — Finance (wallet_transactions_history before attendance)
  { table: "wallet_transactions_history", pk: ["id"] },
  {
    table: "attendance",
    pk: ["id"],
    note: "unique(session_id,student_id) + unique(transaction_id) may also conflict",
  },
  { table: "bonuses", pk: ["id"] },
  { table: "customer_care_service", pk: ["id"] },
  { table: "staff_monthly_stats", pk: ["id"] },
  { table: "extra_allowances", pk: ["id"] },
  { table: "cost_extend", pk: ["id"] },
  { table: "role_tax_deduction_rates", pk: ["id"] },
  { table: "staff_tax_deduction_overrides", pk: ["id"] },
  { table: "student_wallet_sepay_orders", pk: ["id"] },
  { table: "student_wallet_direct_topup_requests", pk: ["id"] },

  // Phase 6 — Content & audit
  { table: "action_history", pk: ["id"] },
  { table: "class_surveys", pk: ["id"] },
  { table: "documents", pk: ["id"] },
  { table: "notifications", pk: ["id"] },
  { table: "notification_reads", pk: ["id"] },
  { table: "regulations", pk: ["id"] },
  { table: "cf_problem_tutorials", pk: ["id"] },

  // Phase 7 — Lesson models
  { table: "lesson_task", pk: ["id"] },
  { table: "lesson_resources", pk: ["id"] },
  { table: "lesson_outputs", pk: ["id"] },
  { table: "staff_lesson_task", pk: ["id"] },

  // Phase 8 — Student exam schedules
  { table: "student_exam_schedules", pk: ["id"] },

  // Skipped
  {
    table: "dashboard_cache",
    pk: ["cache_key"],
    skip: true,
    note: "transient cache — not worth migrating",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logPhase(msg) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${msg}`);
  console.log("=".repeat(60));
}

function logTable(msg) {
  console.log(`\n  📋 ${msg}`);
}

function logResult(msg) {
  console.log(`     ${msg}`);
}

// ---------------------------------------------------------------------------
// Core migration logic
// ---------------------------------------------------------------------------

async function migrateTable(oldPool, newPool, def) {
  if (def.skip) {
    logTable(`${def.table}: SKIPPED (${def.note})`);
    return { table: def.table, total: 0, inserted: 0, skipped: true };
  }

  // 1. Check if table exists in old DB
  const tableExistsRes = await oldPool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [def.table]
  );
  if (!tableExistsRes.rows[0].exists) {
    logTable(`${def.table}: table does not exist in old DB — skipping`);
    return { table: def.table, total: 0, inserted: 0, skipped: true };
  }

  // 2. Fetch all rows from old DB
  const { rows } = await oldPool.query(`SELECT * FROM "${def.table}"`);
  const total = rows.length;

  if (total === 0) {
    logTable(`${def.table}: 0 rows in old DB — nothing to do`);
    return { table: def.table, total: 0, inserted: 0, skipped: false };
  }

  if (DRY_RUN) {
    logTable(`${def.table}: ${total} rows would be migrated (dry-run)`);
    return { table: def.table, total, inserted: 0, skipped: false };
  }

  // 3. Get column names from first row
  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(", ");
  const conflictCols = def.pk.map((c) => `"${c}"`).join(", ");

  let inserted = 0;

  // 4. Batch insert
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Build multi-row VALUES clause
    const values = [];
    const valueClauses = [];

    for (let rowIdx = 0; rowIdx < batch.length; rowIdx++) {
      const row = batch[rowIdx];
      const placeholders = [];
      for (let colIdx = 0; colIdx < columns.length; colIdx++) {
        const paramIdx = rowIdx * columns.length + colIdx + 1;
        placeholders.push(`$${paramIdx}`);
        values.push(row[columns[colIdx]]);
      }
      valueClauses.push(`(${placeholders.join(", ")})`);
    }

    const sql = `
      INSERT INTO "${def.table}" (${colList})
      VALUES ${valueClauses.join(",\n             ")}
      ON CONFLICT (${conflictCols}) DO NOTHING
    `;

    try {
      const result = await newPool.query(sql, values);
      inserted += result.rowCount ?? 0;
    } catch (err) {
      // If we get a unique/FK violation, try row-by-row
      if (err.code === "23505" || err.code === "23503") {
        logResult(
          `  ⚠️  Batch conflict on ${def.table} (${err.code}), falling back to row-by-row...`
        );
        for (const row of batch) {
          const rowValues = columns.map((c) => row[c]);
          const rowPlaceholders = columns.map((_, idx) => `$${idx + 1}`);
          const rowSql = `
            INSERT INTO "${def.table}" (${colList})
            VALUES (${rowPlaceholders.join(", ")})
            ON CONFLICT (${conflictCols}) DO NOTHING
          `;
          try {
            const r = await newPool.query(rowSql, rowValues);
            inserted += r.rowCount ?? 0;
          } catch (rowErr) {
            if (rowErr.code === "23505" || rowErr.code === "23503") {
              // unique or FK violation — skip this row silently
              logResult(
                `  ⚠️  Skipped row in ${def.table} (${rowErr.code}): PK=${def.pk.map((k) => row[k]).join(",")}`
              );
            } else {
              throw rowErr;
            }
          }
        }
      } else {
        throw err;
      }
    }

    // Progress indicator for large tables
    if (rows.length > BATCH_SIZE) {
      const processed = Math.min(i + BATCH_SIZE, rows.length);
      process.stdout.write(
        `\r     Processing ${def.table}: ${processed}/${rows.length}...`
      );
    }
  }

  if (rows.length > BATCH_SIZE) {
    process.stdout.write("\n");
  }

  const existed = total - inserted;
  logTable(
    `${def.table}: ✅ ${inserted} inserted / ${total} total (${existed} already existed)`
  );

  return { table: def.table, total, inserted, skipped: false };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       Unicorns Edu — Database Merge Migration          ║");
  console.log("║       Old Supabase DB  →  New Supabase DB              ║");
  console.log(
    `║       Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE MIGRATION    "}                       ║`
  );
  console.log("╚══════════════════════════════════════════════════════════╝");

  const oldPool = new Pool({
    connectionString: OLD_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  const newPool = new Pool({
    connectionString: NEW_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  try {
    // Test connections
    logPhase("Testing connections...");
    const oldTest = await oldPool.query("SELECT current_database(), now()");
    logResult(`Old DB: ${oldTest.rows[0].current_database} — connected ✅`);
    const newTest = await newPool.query("SELECT current_database(), now()");
    logResult(`New DB: ${newTest.rows[0].current_database} — connected ✅`);

    // Safety check: ensure we're not pointing to the same database
    if (OLD_DB_URL === NEW_DB_URL) {
      console.error(
        "\n❌ OLD_DATABASE_URL and NEW_DATABASE_URL are identical! Aborting."
      );
      process.exit(1);
    }

    // Disable FK checks during migration for performance
    if (!DRY_RUN) {
      logPhase("Temporarily deferring FK constraints...");
      await newPool.query("SET session_replication_role = 'replica'");
      logResult("FK constraints deferred ✅");
    }

    // Migrate all tables in order
    logPhase("Starting table migration...");
    const results = [];

    for (const tableDef of TABLES) {
      const result = await migrateTable(oldPool, newPool, tableDef);
      results.push(result);
    }

    // Re-enable FK checks
    if (!DRY_RUN) {
      logPhase("Re-enabling FK constraints...");
      await newPool.query("SET session_replication_role = 'origin'");
      logResult("FK constraints re-enabled ✅");
    }

    // Summary
    logPhase("Migration Summary");
    console.log("");
    console.log(
      "  " +
        "Table".padEnd(42) +
        "Total".padStart(8) +
        "Inserted".padStart(10) +
        "Existed".padStart(10)
    );
    console.log("  " + "-".repeat(70));

    let totalRows = 0;
    let totalInserted = 0;

    for (const r of results) {
      if (r.skipped) {
        console.log(`  ${r.table.padEnd(42)}${"SKIP".padStart(8)}`);
        continue;
      }
      const existed = r.total - r.inserted;
      console.log(
        `  ${r.table.padEnd(42)}${String(r.total).padStart(8)}${String(r.inserted).padStart(10)}${String(existed).padStart(10)}`
      );
      totalRows += r.total;
      totalInserted += r.inserted;
    }

    console.log("  " + "-".repeat(70));
    console.log(
      `  ${"TOTAL".padEnd(42)}${String(totalRows).padStart(8)}${String(totalInserted).padStart(10)}${String(totalRows - totalInserted).padStart(10)}`
    );
    console.log("");

    if (DRY_RUN) {
      console.log("  🏷️  This was a DRY RUN. No data was written.");
      console.log(
        "  Run without --dry-run to perform the actual migration."
      );
    } else {
      console.log("  ✅ Migration completed successfully!");
    }
    console.log("");
  } catch (err) {
    console.error("\n❌ Migration failed:", err);

    // Try to re-enable FK constraints even on error
    try {
      if (!DRY_RUN) {
        await newPool.query("SET session_replication_role = 'origin'");
        console.log("  FK constraints re-enabled after error.");
      }
    } catch (e) {
      // ignore
    }

    process.exit(1);
  } finally {
    await oldPool.end();
    await newPool.end();
  }
}

main();
