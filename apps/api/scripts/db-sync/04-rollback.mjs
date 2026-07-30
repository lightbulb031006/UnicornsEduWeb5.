/**
 * BƯỚC 4 (chỉ dùng khi cần) — HOÀN TÁC BACKFILL
 *
 * Xoá CHÍNH XÁC những bản ghi mà 03-backfill.mjs đã chèn, đọc từ file
 * backfill_applied_*.json. Không đụng tới bất kỳ bản ghi nào khác.
 *
 * Xoá theo thứ tự NGƯỢC với thứ tự chèn để không vướng khoá ngoại.
 *
 * Chạy:
 *   node 04-rollback.mjs out/backfill_applied_2026-07-30_23-40-00.json           # DRY RUN
 *   node 04-rollback.mjs out/backfill_applied_2026-07-30_23-40-00.json --apply   # xoá thật
 */

import fs from "node:fs";
import path from "node:path";
import {
  loadEnv,
  connect,
  chunk,
  fmtNumber,
  heading,
  quoteIdent,
} from "./_lib.mjs";

const APPLY = process.argv.includes("--apply");
const logPath = process.argv.slice(2).find((a) => !a.startsWith("--"));

async function main() {
  if (!logPath) {
    console.error(
      "❌ Thiếu đường dẫn file nhật ký.\n" +
        "   Ví dụ: node 04-rollback.mjs out/backfill_applied_....json --apply"
    );
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), logPath);
  if (!fs.existsSync(resolved)) {
    console.error(`❌ Không thấy file: ${resolved}`);
    process.exit(1);
  }

  const log = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (log.mode !== "apply") {
    console.error(
      "❌ File này là DRY RUN (không có gì được ghi vào DB). Không cần rollback."
    );
    process.exit(1);
  }

  heading(
    APPLY ? "HOÀN TÁC BACKFILL (XOÁ THẬT)" : "HOÀN TÁC BACKFILL (DRY RUN — chưa xoá gì)"
  );
  console.log(`  Nhật ký      : ${resolved}`);
  console.log(`  Backfill lúc : ${log.startedAt}`);

  const tablesInInsertOrder = log.tables.map((t) => t.table);
  const deleteOrder = [...tablesInInsertOrder].reverse();

  const totalToDelete = deleteOrder.reduce(
    (sum, t) => sum + (log.insertedIds[t]?.length || 0),
    0
  );
  console.log(`  Sẽ xoá       : ${fmtNumber(totalToDelete)} bản ghi\n`);

  if (totalToDelete === 0) {
    console.log("  Không có gì để xoá.\n");
    return;
  }

  const { newUrl } = loadEnv();
  const newDb = await connect(newUrl, "DB MỚI ");
  let transactionOpen = false;

  try {
    await newDb.query("BEGIN");
    transactionOpen = true;
    // Savepoint để lệnh SET lỗi không làm abort cả transaction
    await newDb.query("SAVEPOINT srr_sp");
    try {
      await newDb.query("SET LOCAL session_replication_role = 'replica'");
      await newDb.query("RELEASE SAVEPOINT srr_sp");
    } catch {
      await newDb.query("ROLLBACK TO SAVEPOINT srr_sp");
      await newDb.query("RELEASE SAVEPOINT srr_sp");
    }

    let totalDeleted = 0;

    for (const table of deleteOrder) {
      const ids = log.insertedIds[table] || [];
      if (ids.length === 0) continue;

      // Xác định cột khoá chính từ độ dài mảng id đã lưu
      const tableMeta = log.tables.find((t) => t.table === table);
      const pkColumns = await resolvePkColumns(newDb, table);
      if (!pkColumns.length) continue;

      let deleted = 0;

      for (const batch of chunk(ids, 500)) {
        if (pkColumns.length === 1) {
          const values = batch.map((v) => (Array.isArray(v) ? v[0] : v));
          const res = await newDb.query(
            `DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent(pkColumns[0])} = ANY($1::text[])`,
            [values.map(String)]
          );
          deleted += res.rowCount ?? 0;
        } else {
          for (const value of batch) {
            const conditions = pkColumns
              .map((c, i) => `${quoteIdent(c)}::text = $${i + 1}`)
              .join(" AND ");
            const res = await newDb.query(
              `DELETE FROM ${quoteIdent(table)} WHERE ${conditions}`,
              value.map(String)
            );
            deleted += res.rowCount ?? 0;
          }
        }
      }

      totalDeleted += deleted;
      console.log(
        `  🗑️  ${table.padEnd(38)} xoá ${fmtNumber(deleted).padStart(7)} / ${fmtNumber(ids.length)}` +
          (tableMeta ? "" : "")
      );
    }

    // Không cần reset session_replication_role: SET LOCAL tự hết hiệu lực khi
    // transaction kết thúc, và gọi thừa có thể làm abort transaction.

    heading("KẾT QUẢ");
    console.log(`  Tổng xoá: ${fmtNumber(totalDeleted)} / ${fmtNumber(totalToDelete)}`);

    if (APPLY) {
      await newDb.query("COMMIT");
      transactionOpen = false;
      console.log("\n  ✅ ĐÃ COMMIT. DB mới đã trở về trạng thái trước backfill.\n");
    } else {
      await newDb.query("ROLLBACK");
      transactionOpen = false;
      console.log("\n  🏷️  DRY RUN — đã ROLLBACK, chưa xoá gì thật.");
      console.log("     Chạy lại kèm --apply nếu thực sự muốn hoàn tác.\n");
    }
  } catch (err) {
    if (transactionOpen) {
      try {
        await newDb.query("ROLLBACK");
        console.error("\n  ↩️  Đã ROLLBACK.");
      } catch {}
    }
    throw err;
  } finally {
    await newDb.end();
  }
}

async function resolvePkColumns(client, table) {
  const { rows } = await client.query(
    `
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_name = $1
    ORDER BY kcu.ordinal_position
  `,
    [table]
  );
  return rows.map((r) => r.column_name);
}

main().catch((err) => {
  console.error("\n❌ Lỗi:", err);
  process.exit(1);
});
