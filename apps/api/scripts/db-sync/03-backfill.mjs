/**
 * BƯỚC 3 — BACKFILL: CHÈN BỔ SUNG DB CŨ → DB MỚI
 *
 * ĐẶC ĐIỂM AN TOÀN:
 *  - CHỈ INSERT. Không UPDATE, không DELETE, không TRUNCATE.
 *    → Toàn bộ dữ liệu nhập trên web mới từ 20/7 KHÔNG BỊ ĐỤNG TỚI.
 *  - Chỉ chèn bản ghi có khoá chính CHƯA tồn tại ở DB mới → chạy lại nhiều lần
 *    vẫn an toàn (idempotent), không nhân đôi dữ liệu.
 *  - Chạy trong MỘT transaction duy nhất: lỗi giữa chừng → rollback sạch, DB mới
 *    trở về đúng trạng thái ban đầu.
 *  - Mặc định là DRY RUN: thực hiện chèn thật trong transaction rồi ROLLBACK,
 *    nên bạn thấy chính xác kết quả sẽ ra sao mà không thay đổi gì.
 *
 * Chạy:
 *   node 03-backfill.mjs              # DRY RUN (khuyến nghị chạy trước)
 *   node 03-backfill.mjs --apply      # ghi thật (COMMIT)
 *   node 03-backfill.mjs --only=sessions,attendance
 *   node 03-backfill.mjs --exclude=action_history,notifications
 */

import path from "node:path";
import {
  __dirname,
  loadEnv,
  connect,
  listTables,
  listColumns,
  listPrimaryKeys,
  listForeignKeys,
  topoSortTables,
  pkKey,
  chunk,
  fmtNumber,
  heading,
  ensureDir,
  timestampSlug,
  writeJson,
  quoteIdent,
} from "./_lib.mjs";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 200;
const MAX_PASSES = 3; // số lượt thử lại cho bản ghi lỗi khoá ngoại

function argValue(name) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean) : null;
}

const ONLY = argValue("only");
const EXCLUDE = argValue("exclude") || [];

function warnIfPooler(url, label) {
  if (/:6543|pooler/i.test(url)) {
    console.log(
      `\n  ⚠️  ${label} đang dùng connection pooler (:6543).\n` +
        "      Backfill CẦN direct connection (:5432) để transaction và\n" +
        "      session_replication_role hoạt động đúng. Hãy đổi trong .env.migration.\n"
    );
  }
}

async function main() {
  heading(
    APPLY
      ? "BƯỚC 3 — BACKFILL (CHẾ ĐỘ GHI THẬT — SẼ COMMIT)"
      : "BƯỚC 3 — BACKFILL (DRY RUN — chèn thử rồi ROLLBACK, không thay đổi gì)"
  );

  const { oldUrl, newUrl } = loadEnv();
  warnIfPooler(newUrl, "DB MỚI");

  const oldDb = await connect(oldUrl, "DB CŨ  ");
  const newDb = await connect(newUrl, "DB MỚI ");

  const summary = {
    startedAt: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    tables: [],
    insertedIds: {},
    skipped: [],
  };

  let transactionOpen = false;

  try {
    // -----------------------------------------------------------------------
    // Chuẩn bị metadata
    // -----------------------------------------------------------------------
    const [oldTables, newTables] = await Promise.all([listTables(oldDb), listTables(newDb)]);
    const [oldColumns, newColumns] = await Promise.all([
      listColumns(oldDb),
      listColumns(newDb),
    ]);
    const newPks = await listPrimaryKeys(newDb);
    const fkEdges = await listForeignKeys(newDb);

    let shared = oldTables.filter((t) => newTables.includes(t));
    if (ONLY) shared = shared.filter((t) => ONLY.includes(t));
    shared = shared.filter((t) => !EXCLUDE.includes(t));
    shared = shared.filter((t) => t !== "dashboard_cache"); // cache tạm, không cần

    const { ordered } = topoSortTables(shared, fkEdges);

    console.log(`\n  Sẽ xử lý ${ordered.length} bảng theo thứ tự phụ thuộc khoá ngoại.`);

    // -----------------------------------------------------------------------
    // Mở transaction
    // -----------------------------------------------------------------------
    await newDb.query("BEGIN");
    transactionOpen = true;
    await newDb.query("SET LOCAL idle_in_transaction_session_timeout = 0");

    // Bọc trong savepoint: nếu tài khoản DB không có quyền, lệnh SET sẽ lỗi và
    // làm ABORT cả transaction nếu không có savepoint để lùi lại.
    let fkDeferred = false;
    await newDb.query("SAVEPOINT srr_sp");
    try {
      await newDb.query("SET LOCAL session_replication_role = 'replica'");
      await newDb.query("RELEASE SAVEPOINT srr_sp");
      fkDeferred = true;
      console.log("  🔓 Đã tạm hoãn kiểm tra khoá ngoại trong transaction này.");
    } catch {
      await newDb.query("ROLLBACK TO SAVEPOINT srr_sp");
      await newDb.query("RELEASE SAVEPOINT srr_sp");
      console.log(
        "  ℹ️  Không có quyền hoãn kiểm tra khoá ngoại — sẽ chèn nhiều lượt theo thứ tự phụ thuộc."
      );
    }

    // -----------------------------------------------------------------------
    // Chèn từng bảng
    // -----------------------------------------------------------------------
    heading("Tiến hành chèn");

    let grandInserted = 0;
    let grandSkipped = 0;
    const deferredRows = []; // { table, row, columns, pkColumns }

    for (const table of ordered) {
      const pkColumns = newPks.get(table);
      if (!pkColumns?.length) {
        console.log(`  ⏭️  ${table}: bỏ qua (không có khoá chính)`);
        continue;
      }

      const oldColNames = (oldColumns.get(table) || []).map((c) => c.name);
      const newColDefs = newColumns.get(table) || [];
      const newColNames = newColDefs.map((c) => c.name);
      const columns = oldColNames.filter((c) => newColNames.includes(c));

      if (columns.length === 0) {
        console.log(`  ⏭️  ${table}: bỏ qua (không có cột chung)`);
        continue;
      }

      // Khoá chính của DB mới phải tồn tại ở DB cũ, nếu không sẽ không thể
      // xác định bản ghi nào đã có / chưa có.
      const pkMissingInOld = pkColumns.filter((c) => !columns.includes(c));
      if (pkMissingInOld.length) {
        console.log(
          `  ❌ ${table}: DB cũ không có cột khoá chính (${pkMissingInOld.join(", ")}) — bỏ qua bảng này.`
        );
        summary.skipped.push({
          table,
          reason: `thiếu cột khoá chính ở DB cũ: ${pkMissingInOld.join(", ")}`,
        });
        continue;
      }

      // Cột bắt buộc ở DB mới nhưng DB cũ không có → sẽ fail, báo trước
      const blocking = newColDefs
        .filter((c) => c.isRequired && !columns.includes(c.name))
        .map((c) => c.name);
      if (blocking.length) {
        console.log(
          `  ❌ ${table}: DB mới có cột bắt buộc không có ở DB cũ (${blocking.join(", ")}) — bỏ qua bảng này.`
        );
        summary.skipped.push({ table, reason: `thiếu cột bắt buộc: ${blocking.join(", ")}` });
        continue;
      }

      // Lấy dữ liệu nguồn + khoá chính đã có ở đích
      const colList = columns.map(quoteIdent).join(", ");
      const { rows: sourceRows } = await oldDb.query(
        `SELECT ${colList} FROM ${quoteIdent(table)}`
      );
      if (sourceRows.length === 0) {
        console.log(`  ○  ${table}: DB cũ trống`);
        continue;
      }

      const { rows: existingRows } = await newDb.query(
        `SELECT ${pkColumns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)}`
      );
      const existing = new Set(existingRows.map((r) => pkKey(r, pkColumns)));

      const missing = sourceRows.filter((r) => !existing.has(pkKey(r, pkColumns)));
      if (missing.length === 0) {
        console.log(`  ✓  ${table}: đã đầy đủ (${fmtNumber(sourceRows.length)} bản ghi)`);
        continue;
      }

      const result = await insertRows(newDb, table, columns, pkColumns, missing, {
        collectDeferred: !fkDeferred ? deferredRows : null,
        summary,
      });

      grandInserted += result.inserted;
      grandSkipped += result.skipped;

      summary.tables.push({
        table,
        sourceRows: sourceRows.length,
        missing: missing.length,
        inserted: result.inserted,
        skipped: result.skipped,
      });

      const skipNote = result.skipped ? `, ${result.skipped} bỏ qua` : "";
      console.log(
        `  ➕ ${table.padEnd(38)} chèn ${fmtNumber(result.inserted).padStart(7)} / ${fmtNumber(missing.length)} thiếu${skipNote}`
      );
    }

    // -----------------------------------------------------------------------
    // Lượt thử lại cho bản ghi lỗi khoá ngoại (khi không hoãn được FK)
    // -----------------------------------------------------------------------
    if (deferredRows.length) {
      let pending = deferredRows;
      for (let pass = 2; pass <= MAX_PASSES && pending.length; pass++) {
        console.log(`\n  🔁 Lượt ${pass}: thử lại ${fmtNumber(pending.length)} bản ghi lỗi khoá ngoại…`);
        const stillPending = [];

        for (const item of pending) {
          const res = await insertRows(
            newDb,
            item.table,
            item.columns,
            item.pkColumns,
            [item.row],
            { collectDeferred: stillPending, summary, quiet: true }
          );
          grandInserted += res.inserted;
        }

        if (stillPending.length === pending.length) break; // không tiến triển nữa
        pending = stillPending;
      }

      if (pending.length) {
        console.log(
          `  ⚠️  Còn ${fmtNumber(pending.length)} bản ghi không chèn được do thiếu bản ghi cha.`
        );
        for (const item of pending) {
          summary.skipped.push({
            table: item.table,
            pk: item.pkColumns.map((c) => item.row[c]).join(","),
            reason: "khoá ngoại không giải quyết được",
          });
        }
        grandSkipped += pending.length;
      }
    }

    if (fkDeferred) {
      await newDb.query("SET LOCAL session_replication_role = 'origin'");
    }

    // -----------------------------------------------------------------------
    // Kết thúc transaction
    // -----------------------------------------------------------------------
    heading("TỔNG KẾT");
    console.log(`  Bản ghi sẽ chèn / đã chèn : ${fmtNumber(grandInserted)}`);
    console.log(`  Bản ghi bỏ qua            : ${fmtNumber(grandSkipped)}`);

    summary.totalInserted = grandInserted;
    summary.totalSkipped = grandSkipped;
    summary.finishedAt = new Date().toISOString();

    const outDir = ensureDir(path.join(__dirname, "out"));
    const stamp = timestampSlug();

    if (APPLY) {
      await newDb.query("COMMIT");
      transactionOpen = false;
      const file = writeJson(path.join(outDir, `backfill_applied_${stamp}.json`), summary);
      console.log("\n  ✅ ĐÃ COMMIT. Dữ liệu đã được ghi vào DB mới.");
      console.log(`  📄 Nhật ký + danh sách ID đã chèn: ${file}`);
      console.log("     → Giữ file này. Nếu cần hoàn tác: node 04-rollback.mjs <đường-dẫn-file>");
    } else {
      await newDb.query("ROLLBACK");
      transactionOpen = false;
      const file = writeJson(path.join(outDir, `backfill_dryrun_${stamp}.json`), summary);
      console.log("\n  🏷️  ĐÂY LÀ DRY RUN — đã ROLLBACK, DB mới KHÔNG thay đổi.");
      console.log(`  📄 Báo cáo: ${file}`);
      console.log("     → Xem kỹ số liệu, nếu ổn thì chạy lại với --apply");
    }
    console.log("");
  } catch (err) {
    if (transactionOpen) {
      try {
        await newDb.query("ROLLBACK");
        console.error("\n  ↩️  Đã ROLLBACK — DB mới không bị thay đổi.");
      } catch {}
    }
    throw err;
  } finally {
    await oldDb.end();
    await newDb.end();
  }
}

/**
 * Chèn một tập bản ghi, trả về { inserted, skipped }.
 * Lỗi trùng khoá / khoá ngoại được xử lý từng dòng thay vì làm hỏng cả batch.
 */
async function insertRows(client, table, columns, pkColumns, rows, opts) {
  const { collectDeferred, summary, quiet } = opts;
  const colList = columns.map(quoteIdent).join(", ");
  const conflictList = pkColumns.map(quoteIdent).join(", ");
  const returning = pkColumns.map(quoteIdent).join(", ");

  let inserted = 0;
  let skipped = 0;

  if (!summary.insertedIds[table]) summary.insertedIds[table] = [];

  for (const batch of chunk(rows, BATCH_SIZE)) {
    const values = [];
    const clauses = [];

    batch.forEach((row, rowIdx) => {
      const placeholders = columns.map((col, colIdx) => {
        values.push(row[col]);
        return `$${rowIdx * columns.length + colIdx + 1}`;
      });
      clauses.push(`(${placeholders.join(", ")})`);
    });

    const sql =
      `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES ${clauses.join(", ")} ` +
      `ON CONFLICT (${conflictList}) DO NOTHING RETURNING ${returning}`;

    // QUAN TRỌNG: mỗi batch phải nằm trong savepoint riêng. Nếu batch lỗi mà
    // không có savepoint thì cả transaction bị abort và MỌI lệnh sau đều bị
    // Postgres từ chối ("current transaction is aborted").
    await client.query("SAVEPOINT batch_sp");
    try {
      const res = await client.query(sql, values);
      await client.query("RELEASE SAVEPOINT batch_sp");
      inserted += res.rowCount ?? 0;
      for (const row of res.rows) {
        summary.insertedIds[table].push(pkColumns.map((c) => row[c]));
      }
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT batch_sp");
      await client.query("RELEASE SAVEPOINT batch_sp");

      // Batch hỏng → thử từng dòng để cô lập đúng bản ghi có vấn đề
      if (!["23505", "23503", "23514", "22P02", "23502"].includes(err.code)) throw err;

      for (const row of batch) {
        const rowValues = columns.map((c) => row[c]);
        const rowSql =
          `INSERT INTO ${quoteIdent(table)} (${colList}) ` +
          `VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}) ` +
          `ON CONFLICT (${conflictList}) DO NOTHING RETURNING ${returning}`;

        await client.query("SAVEPOINT row_sp");
        try {
          const res = await client.query(rowSql, rowValues);
          await client.query("RELEASE SAVEPOINT row_sp");
          inserted += res.rowCount ?? 0;
          for (const r of res.rows) {
            summary.insertedIds[table].push(pkColumns.map((c) => r[c]));
          }
        } catch (rowErr) {
          await client.query("ROLLBACK TO SAVEPOINT row_sp");
          await client.query("RELEASE SAVEPOINT row_sp");

          if (rowErr.code === "23503" && collectDeferred) {
            // thiếu bản ghi cha — để lượt sau thử lại
            collectDeferred.push({ table, row, columns, pkColumns });
          } else {
            skipped++;
            const pkValue = pkColumns.map((c) => row[c]).join(",");
            summary.skipped.push({
              table,
              pk: pkValue,
              code: rowErr.code,
              reason: rowErr.detail || rowErr.message,
            });
            if (!quiet) {
              console.log(`       ⚠️  bỏ qua ${table} pk=${pkValue} (${rowErr.code})`);
            }
          }
        }
      }
    }
  }

  return { inserted, skipped };
}

main().catch((err) => {
  console.error("\n❌ Lỗi:", err);
  process.exit(1);
});
