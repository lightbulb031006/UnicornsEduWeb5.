/**
 * BƯỚC 5 — KIỂM CHỨNG SAU BACKFILL (CHỈ ĐỌC)
 *
 * Kiểm tra 3 việc:
 *  1. Còn bản ghi nào của DB cũ chưa có ở DB mới không (phải = 0).
 *  2. DB mới có bản ghi "mồ côi" không — tức là trỏ tới cha không tồn tại.
 *     Đây là rủi ro khi backfill tạm tắt kiểm tra khoá ngoại, BẮT BUỘC phải kiểm.
 *  3. Số buổi học theo tháng ở DB mới đã khớp DB cũ chưa.
 *
 * Chạy:  node 05-verify.mjs
 */

import path from "node:path";
import {
  __dirname,
  loadEnv,
  connect,
  listTables,
  listPrimaryKeys,
  pkKey,
  fmtNumber,
  heading,
  ensureDir,
  timestampSlug,
  writeJson,
  quoteIdent,
} from "./_lib.mjs";

/** Lấy chi tiết mọi ràng buộc khoá ngoại kèm tên cột. */
async function listForeignKeyDetails(client) {
  const { rows } = await client.query(`
    SELECT
      con.conname                        AS name,
      child.relname                      AS child_table,
      parent.relname                     AS parent_table,
      (SELECT array_agg(att.attname ORDER BY x.ord)
         FROM unnest(con.conkey) WITH ORDINALITY AS x(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = x.attnum
      )                                  AS child_columns,
      (SELECT array_agg(att.attname ORDER BY x.ord)
         FROM unnest(con.confkey) WITH ORDINALITY AS x(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = x.attnum
      )                                  AS parent_columns
    FROM pg_constraint con
    JOIN pg_class child  ON child.oid  = con.conrelid
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace nsp ON nsp.oid = con.connamespace
    WHERE con.contype = 'f' AND nsp.nspname = 'public'
    ORDER BY child.relname, con.conname
  `);
  return rows;
}

async function main() {
  heading("BƯỚC 5 — KIỂM CHỨNG SAU BACKFILL");

  const { oldUrl, newUrl } = loadEnv();
  const oldDb = await connect(oldUrl, "DB CŨ  ");
  const newDb = await connect(newUrl, "DB MỚI ");

  const report = { checkedAt: new Date().toISOString(), missing: [], orphans: [], sessions: [] };

  try {
    // -----------------------------------------------------------------------
    heading("1. Bản ghi DB cũ còn thiếu ở DB mới");
    // -----------------------------------------------------------------------
    const [oldTables, newTables] = await Promise.all([listTables(oldDb), listTables(newDb)]);
    const shared = oldTables
      .filter((t) => newTables.includes(t))
      .filter((t) => t !== "dashboard_cache");
    const newPks = await listPrimaryKeys(newDb);

    let totalMissing = 0;

    for (const table of shared) {
      const pkColumns = newPks.get(table);
      if (!pkColumns?.length) continue;

      const cols = pkColumns.map(quoteIdent).join(", ");
      const [oldRows, newRows] = await Promise.all([
        oldDb.query(`SELECT ${cols} FROM ${quoteIdent(table)}`).then((r) => r.rows),
        newDb.query(`SELECT ${cols} FROM ${quoteIdent(table)}`).then((r) => r.rows),
      ]);

      const newSet = new Set(newRows.map((r) => pkKey(r, pkColumns)));
      const missing = oldRows.filter((r) => !newSet.has(pkKey(r, pkColumns))).length;

      if (missing > 0) {
        totalMissing += missing;
        console.log(`  ❌ ${table.padEnd(40)} còn thiếu ${fmtNumber(missing)}`);
        report.missing.push({ table, missing });
      }
    }

    if (totalMissing === 0) {
      console.log("  ✅ Không còn bản ghi nào thiếu. DB mới đã bao trọn DB cũ.");
    } else {
      console.log(`\n  Tổng còn thiếu: ${fmtNumber(totalMissing)}`);
    }

    // -----------------------------------------------------------------------
    heading("2. Bản ghi mồ côi ở DB mới (khoá ngoại trỏ vào khoảng không)");
    // -----------------------------------------------------------------------
    const fks = await listForeignKeyDetails(newDb);
    let totalOrphans = 0;

    for (const fk of fks) {
      const childCols = fk.child_columns;
      const parentCols = fk.parent_columns;
      if (!childCols?.length || !parentCols?.length) continue;

      const notNull = childCols.map((c) => `c.${quoteIdent(c)} IS NOT NULL`).join(" AND ");
      const joinCond = childCols
        .map((c, i) => `p.${quoteIdent(parentCols[i])} = c.${quoteIdent(c)}`)
        .join(" AND ");

      const sql = `
        SELECT count(*)::bigint AS c
        FROM ${quoteIdent(fk.child_table)} c
        WHERE ${notNull}
          AND NOT EXISTS (
            SELECT 1 FROM ${quoteIdent(fk.parent_table)} p WHERE ${joinCond}
          )
      `;

      const count = Number((await newDb.query(sql)).rows[0].c);
      if (count > 0) {
        totalOrphans += count;
        console.log(
          `  ❌ ${fk.child_table}.${childCols.join(",")} → ${fk.parent_table}: ${fmtNumber(count)} bản ghi mồ côi`
        );
        report.orphans.push({
          constraint: fk.name,
          child: fk.child_table,
          childColumns: childCols,
          parent: fk.parent_table,
          count,
        });
      }
    }

    if (totalOrphans === 0) {
      console.log("  ✅ Không có bản ghi mồ côi. Toàn vẹn khoá ngoại đảm bảo.");
    } else {
      console.log(
        `\n  ⚠️  Tổng ${fmtNumber(totalOrphans)} bản ghi mồ côi — cần xử lý trước khi dùng web mới.`
      );
    }

    // -----------------------------------------------------------------------
    heading("3. Buổi học theo tháng");
    // -----------------------------------------------------------------------
    if (shared.includes("sessions")) {
      const sql = `
        SELECT to_char(date, 'YYYY-MM') AS month, count(*)::bigint AS c
        FROM sessions GROUP BY 1 ORDER BY 1
      `;
      const [oldHist, newHist] = await Promise.all([
        oldDb.query(sql).then((r) => r.rows),
        newDb.query(sql).then((r) => r.rows),
      ]);

      const months = [...new Set([...oldHist, ...newHist].map((r) => r.month))].sort();
      const oldMap = new Map(oldHist.map((r) => [r.month, Number(r.c)]));
      const newMap = new Map(newHist.map((r) => [r.month, Number(r.c)]));

      console.log("  " + "Tháng".padEnd(12) + "DB cũ".padStart(10) + "DB mới".padStart(10) + "  Trạng thái");
      console.log("  " + "─".repeat(46));
      for (const month of months) {
        const o = oldMap.get(month) || 0;
        const n = newMap.get(month) || 0;
        const status = n >= o ? "✅" : `❌ thiếu ${o - n}`;
        console.log(`  ${month.padEnd(12)}${fmtNumber(o).padStart(10)}${fmtNumber(n).padStart(10)}  ${status}`);
        report.sessions.push({ month, old: o, new: n });
      }
    }

    // -----------------------------------------------------------------------
    heading("KẾT LUẬN");
    // -----------------------------------------------------------------------
    if (totalMissing === 0 && totalOrphans === 0) {
      console.log("  ✅ ĐẠT. Đồng bộ hoàn tất, dữ liệu toàn vẹn.");
      console.log("     Bước cuối: mở web mới, kiểm tra mắt thường vài lớp có buổi học trước 20/7.\n");
    } else {
      console.log("  ⚠️  CHƯA ĐẠT — xem chi tiết bên trên.\n");
    }

    const outDir = ensureDir(path.join(__dirname, "out"));
    const file = writeJson(path.join(outDir, `verify_${timestampSlug()}.json`), report);
    console.log(`  📄 Báo cáo: ${file}\n`);
  } finally {
    await oldDb.end();
    await newDb.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Lỗi:", err);
  process.exit(1);
});
