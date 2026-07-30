/**
 * BƯỚC 1 — CHẨN ĐOÁN (CHỈ ĐỌC, không ghi bất cứ thứ gì)
 *
 * Trả lời các câu hỏi:
 *  - Hai DB có cùng schema không? Cột/enum nào lệch?
 *  - Bảng nào thiếu bao nhiêu bản ghi ở DB mới?
 *  - Các buổi học thiếu rơi vào tháng nào? Lớp nào?
 *  - Có bản ghi master (lớp/học sinh/user) bị TRÙNG TÊN nhưng KHÁC ID giữa 2 DB không?
 *    (đây là cạm bẫy lớn nhất: chèn xong vẫn không thấy dữ liệu trên web)
 *
 * Chạy:  node 01-diagnose.mjs
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
  listEnums,
  topoSortTables,
  pkKey,
  fmtNumber,
  heading,
  ensureDir,
  timestampSlug,
  writeJson,
  quoteIdent,
} from "./_lib.mjs";

const CUTOVER_DATE = "2026-07-20"; // ngày chuyển sang web mới

async function fetchPkSet(client, table, pkColumns) {
  const cols = pkColumns.map(quoteIdent).join(", ");
  const { rows } = await client.query(`SELECT ${cols} FROM ${quoteIdent(table)}`);
  const set = new Set();
  for (const row of rows) set.add(pkKey(row, pkColumns));
  return set;
}

async function safeCount(client, table) {
  const { rows } = await client.query(`SELECT count(*)::bigint AS c FROM ${quoteIdent(table)}`);
  return Number(rows[0].c);
}

/** Tìm bản ghi cùng "khoá tự nhiên" nhưng khác id giữa 2 DB. */
async function findNaturalKeyClashes(oldDb, newDb, table, keyExpr, label) {
  const sql = `SELECT id::text AS id, ${keyExpr} AS nk FROM ${quoteIdent(table)} WHERE ${keyExpr} IS NOT NULL`;
  const [oldRows, newRows] = await Promise.all([
    oldDb.query(sql).then((r) => r.rows),
    newDb.query(sql).then((r) => r.rows),
  ]);

  const newByKey = new Map();
  for (const row of newRows) {
    const key = String(row.nk).trim().toLowerCase();
    if (!newByKey.has(key)) newByKey.set(key, []);
    newByKey.get(key).push(row.id);
  }

  const newIds = new Set(newRows.map((r) => r.id));
  const clashes = [];

  for (const row of oldRows) {
    const key = String(row.nk).trim().toLowerCase();
    const matches = newByKey.get(key);
    if (!matches) continue; // không có bên mới -> sẽ được chèn bình thường
    if (newIds.has(row.id)) continue; // cùng id -> khớp hoàn hảo, không sao
    clashes.push({ naturalKey: row.nk, oldId: row.id, newIds: matches });
  }

  return { label, table, clashes };
}

async function main() {
  heading("BƯỚC 1 — CHẨN ĐOÁN LỆCH DỮ LIỆU (CHỈ ĐỌC)");

  const { oldUrl, newUrl } = loadEnv();
  const oldDb = await connect(oldUrl, "DB CŨ  ");
  const newDb = await connect(newUrl, "DB MỚI ");

  const report = {
    generatedAt: new Date().toISOString(),
    cutoverDate: CUTOVER_DATE,
    schema: {},
    tables: [],
    sessions: {},
    naturalKeyClashes: [],
    blockers: [],
    warnings: [],
  };

  try {
    // -----------------------------------------------------------------------
    heading("1. So sánh danh sách bảng");
    // -----------------------------------------------------------------------
    const [oldTables, newTables] = await Promise.all([
      listTables(oldDb),
      listTables(newDb),
    ]);

    const onlyOld = oldTables.filter((t) => !newTables.includes(t));
    const onlyNew = newTables.filter((t) => !oldTables.includes(t));
    const shared = oldTables.filter((t) => newTables.includes(t));

    console.log(`  Bảng ở cả 2 DB : ${shared.length}`);
    console.log(`  Chỉ có DB cũ   : ${onlyOld.length ? onlyOld.join(", ") : "(không)"}`);
    console.log(`  Chỉ có DB mới  : ${onlyNew.length ? onlyNew.join(", ") : "(không)"}`);

    if (onlyOld.length) {
      report.warnings.push(
        `DB cũ có ${onlyOld.length} bảng không tồn tại ở DB mới (sẽ bỏ qua): ${onlyOld.join(", ")}`
      );
    }

    report.schema = { onlyOld, onlyNew, shared };

    // -----------------------------------------------------------------------
    heading("2. So sánh cột từng bảng");
    // -----------------------------------------------------------------------
    const [oldCols, newCols] = await Promise.all([
      listColumns(oldDb),
      listColumns(newDb),
    ]);

    const columnDiffs = [];
    for (const table of shared) {
      const oldNames = (oldCols.get(table) || []).map((c) => c.name);
      const newColDefs = newCols.get(table) || [];
      const newNames = newColDefs.map((c) => c.name);

      const missingInNew = oldNames.filter((c) => !newNames.includes(c));
      const missingInOld = newNames.filter((c) => !oldNames.includes(c));

      // Cột bắt buộc ở DB mới mà DB cũ không có -> insert chắc chắn fail
      const blockingCols = newColDefs
        .filter((c) => c.isRequired && !oldNames.includes(c.name))
        .map((c) => c.name);

      if (missingInNew.length || missingInOld.length) {
        columnDiffs.push({ table, missingInNew, missingInOld, blockingCols });
      }

      if (blockingCols.length) {
        report.blockers.push(
          `Bảng "${table}": DB mới có cột BẮT BUỘC không có ở DB cũ: ${blockingCols.join(", ")}`
        );
      }
    }

    if (columnDiffs.length === 0) {
      console.log("  ✅ Không có bảng nào lệch cột.");
    } else {
      for (const diff of columnDiffs) {
        console.log(`  📋 ${diff.table}`);
        if (diff.missingInNew.length)
          console.log(`       cột chỉ có ở DB cũ (sẽ bỏ qua khi chèn): ${diff.missingInNew.join(", ")}`);
        if (diff.missingInOld.length)
          console.log(`       cột chỉ có ở DB mới (dùng default)     : ${diff.missingInOld.join(", ")}`);
        if (diff.blockingCols.length)
          console.log(`       ❌ CHẶN — bắt buộc & không có default   : ${diff.blockingCols.join(", ")}`);
      }
    }
    report.columnDiffs = columnDiffs;

    // -----------------------------------------------------------------------
    heading("3. So sánh enum");
    // -----------------------------------------------------------------------
    const [oldEnums, newEnums] = await Promise.all([listEnums(oldDb), listEnums(newDb)]);
    const enumDiffs = [];

    for (const [name, oldValues] of oldEnums) {
      const newValues = newEnums.get(name);
      if (!newValues) {
        enumDiffs.push({ enum: name, issue: "không tồn tại ở DB mới", values: oldValues });
        continue;
      }
      const missing = oldValues.filter((v) => !newValues.includes(v));
      if (missing.length) {
        enumDiffs.push({ enum: name, issue: "giá trị thiếu ở DB mới", values: missing });
        report.blockers.push(
          `Enum "${name}": DB cũ dùng giá trị mà DB mới chưa có: ${missing.join(", ")}`
        );
      }
    }

    if (enumDiffs.length === 0) {
      console.log("  ✅ Enum tương thích.");
    } else {
      for (const diff of enumDiffs) {
        console.log(`  ⚠️  ${diff.enum}: ${diff.issue} → ${diff.values.join(", ")}`);
      }
    }
    report.enumDiffs = enumDiffs;

    // -----------------------------------------------------------------------
    heading("4. Đếm bản ghi & tìm ID thiếu ở DB mới");
    // -----------------------------------------------------------------------
    const newPks = await listPrimaryKeys(newDb);
    const fkEdges = await listForeignKeys(newDb);
    const { ordered, cyclic } = topoSortTables(shared, fkEdges);

    if (cyclic.length) {
      report.warnings.push(`Bảng nằm trong vòng lặp FK (chèn cuối): ${cyclic.join(", ")}`);
    }

    console.log(
      "  " +
        "Bảng".padEnd(40) +
        "DB cũ".padStart(10) +
        "DB mới".padStart(10) +
        "Thiếu".padStart(10)
    );
    console.log("  " + "─".repeat(70));

    let grandMissing = 0;

    for (const table of ordered) {
      const pkColumns = newPks.get(table);
      if (!pkColumns || pkColumns.length === 0) {
        report.warnings.push(`Bảng "${table}" không có khoá chính — sẽ bỏ qua khi backfill.`);
        console.log(`  ${table.padEnd(40)}${"—".padStart(10)}${"—".padStart(10)}${"NO PK".padStart(10)}`);
        report.tables.push({ table, skipped: true, reason: "không có khoá chính" });
        continue;
      }

      // Khoá chính của DB mới phải tồn tại ở DB cũ mới so sánh được
      const oldColNames = (oldCols.get(table) || []).map((c) => c.name);
      const pkMissingInOld = pkColumns.filter((c) => !oldColNames.includes(c));
      if (pkMissingInOld.length) {
        report.warnings.push(
          `Bảng "${table}": DB cũ thiếu cột khoá chính (${pkMissingInOld.join(", ")}) — không so sánh được.`
        );
        console.log(
          `  ${table.padEnd(40)}${"—".padStart(10)}${"—".padStart(10)}${"PK?".padStart(10)}`
        );
        report.tables.push({ table, skipped: true, reason: "DB cũ thiếu cột khoá chính" });
        continue;
      }

      const [oldCount, newCount] = await Promise.all([
        safeCount(oldDb, table),
        safeCount(newDb, table),
      ]);

      let missingCount = 0;
      if (oldCount > 0) {
        const [oldSet, newSet] = await Promise.all([
          fetchPkSet(oldDb, table, pkColumns),
          fetchPkSet(newDb, table, pkColumns),
        ]);
        for (const key of oldSet) if (!newSet.has(key)) missingCount++;
      }

      grandMissing += missingCount;

      const flag = missingCount > 0 ? " ←" : "";
      console.log(
        `  ${table.padEnd(40)}${fmtNumber(oldCount).padStart(10)}${fmtNumber(newCount).padStart(10)}${fmtNumber(missingCount).padStart(10)}${flag}`
      );

      report.tables.push({
        table,
        pk: pkColumns,
        oldCount,
        newCount,
        missingInNew: missingCount,
      });
    }

    console.log("  " + "─".repeat(70));
    console.log(`  TỔNG bản ghi cần chèn bổ sung: ${fmtNumber(grandMissing)}`);
    report.totalMissing = grandMissing;

    // -----------------------------------------------------------------------
    heading("5. Đào sâu bảng sessions (buổi học)");
    // -----------------------------------------------------------------------
    if (shared.includes("sessions")) {
      const histogramSql = `
        SELECT to_char(date, 'YYYY-MM') AS month, count(*)::bigint AS c
        FROM sessions GROUP BY 1 ORDER BY 1
      `;
      const [oldHist, newHist] = await Promise.all([
        oldDb.query(histogramSql).then((r) => r.rows),
        newDb.query(histogramSql).then((r) => r.rows),
      ]);

      const months = [...new Set([...oldHist, ...newHist].map((r) => r.month))].sort();
      const oldByMonth = new Map(oldHist.map((r) => [r.month, Number(r.c)]));
      const newByMonth = new Map(newHist.map((r) => [r.month, Number(r.c)]));

      console.log("  Số buổi học theo tháng:");
      console.log("  " + "Tháng".padEnd(12) + "DB cũ".padStart(10) + "DB mới".padStart(10));
      console.log("  " + "─".repeat(32));
      for (const month of months) {
        console.log(
          `  ${month.padEnd(12)}${fmtNumber(oldByMonth.get(month) || 0).padStart(10)}${fmtNumber(newByMonth.get(month) || 0).padStart(10)}`
        );
      }
      report.sessions.histogram = months.map((m) => ({
        month: m,
        old: oldByMonth.get(m) || 0,
        new: newByMonth.get(m) || 0,
      }));

      // Buổi học có ở DB cũ nhưng thiếu ở DB mới
      const oldSessions = await oldDb
        .query(`SELECT id, class_id, teacher_id, date FROM sessions`)
        .then((r) => r.rows);
      const newSessionIds = await newDb
        .query(`SELECT id FROM sessions`)
        .then((r) => new Set(r.rows.map((x) => x.id)));

      const missingSessions = oldSessions.filter((s) => !newSessionIds.has(s.id));

      // Lớp/giáo viên của các buổi thiếu đó đã có ở DB mới chưa?
      const newClassIds = await newDb
        .query(`SELECT id FROM classes`)
        .then((r) => new Set(r.rows.map((x) => x.id)));
      const newStaffIds = await newDb
        .query(`SELECT id FROM staff_info`)
        .then((r) => new Set(r.rows.map((x) => x.id)));
      const oldClassNames = await oldDb
        .query(`SELECT id, name FROM classes`)
        .then((r) => new Map(r.rows.map((x) => [x.id, x.name])));

      const byClass = new Map();
      for (const s of missingSessions) {
        if (!byClass.has(s.class_id)) {
          byClass.set(s.class_id, {
            classId: s.class_id,
            className: oldClassNames.get(s.class_id) || "(không rõ)",
            classExistsInNew: newClassIds.has(s.class_id),
            count: 0,
            minDate: s.date,
            maxDate: s.date,
          });
        }
        const entry = byClass.get(s.class_id);
        entry.count++;
        if (s.date < entry.minDate) entry.minDate = s.date;
        if (s.date > entry.maxDate) entry.maxDate = s.date;
      }

      const missingTeachers = new Set(
        missingSessions.filter((s) => !newStaffIds.has(s.teacher_id)).map((s) => s.teacher_id)
      );
      const beforeCutover = missingSessions.filter((s) => s.date < CUTOVER_DATE).length;

      console.log(`\n  Tổng buổi học thiếu ở DB mới : ${fmtNumber(missingSessions.length)}`);
      console.log(`    trong đó trước ${CUTOVER_DATE} : ${fmtNumber(beforeCutover)}`);
      console.log(`    từ ${CUTOVER_DATE} trở đi      : ${fmtNumber(missingSessions.length - beforeCutover)}`);
      console.log(`  Số lớp bị ảnh hưởng           : ${byClass.size}`);
      console.log(`  Giáo viên chưa có ở DB mới    : ${missingTeachers.size}`);

      const classList = [...byClass.values()].sort((a, b) => b.count - a.count);
      if (classList.length) {
        console.log("\n  Top lớp thiếu nhiều buổi nhất:");
        for (const c of classList.slice(0, 15)) {
          const mark = c.classExistsInNew ? "✅" : "❌ lớp CHƯA có ở DB mới";
          console.log(
            `    ${String(c.count).padStart(4)} buổi  ${c.minDate} → ${c.maxDate}  ${c.className}  ${mark}`
          );
        }
      }

      report.sessions.missingTotal = missingSessions.length;
      report.sessions.missingBeforeCutover = beforeCutover;
      report.sessions.affectedClasses = classList;
      report.sessions.teachersMissingInNew = [...missingTeachers];
    } else {
      console.log("  ⚠️  Không có bảng sessions ở cả 2 DB.");
    }

    // -----------------------------------------------------------------------
    heading("6. Phát hiện bản ghi TRÙNG TÊN nhưng KHÁC ID (cạm bẫy chính)");
    // -----------------------------------------------------------------------
    const clashChecks = [];
    if (shared.includes("classes")) {
      clashChecks.push(findNaturalKeyClashes(oldDb, newDb, "classes", "name", "Lớp học"));
    }
    if (shared.includes("student_info")) {
      clashChecks.push(
        findNaturalKeyClashes(oldDb, newDb, "student_info", "full_name", "Học sinh")
      );
    }
    if (shared.includes("users")) {
      clashChecks.push(findNaturalKeyClashes(oldDb, newDb, "users", "email", "Tài khoản (email)"));
    }

    const clashResults = await Promise.all(clashChecks);
    for (const result of clashResults) {
      if (result.clashes.length === 0) {
        console.log(`  ✅ ${result.label}: không có trùng tên khác ID.`);
      } else {
        console.log(
          `  ❌ ${result.label}: ${result.clashes.length} bản ghi trùng tên nhưng KHÁC ID.`
        );
        for (const clash of result.clashes.slice(0, 10)) {
          console.log(`       "${clash.naturalKey}"  cũ=${clash.oldId}  mới=${clash.newIds.join(",")}`);
        }
        if (result.clashes.length > 10) {
          console.log(`       … và ${result.clashes.length - 10} bản ghi nữa`);
        }
        report.blockers.push(
          `${result.label}: ${result.clashes.length} bản ghi trùng tên nhưng khác ID — ` +
            `chèn thẳng sẽ tạo bản ghi song song, dữ liệu cũ vẫn không hiện đúng chỗ trên web mới.`
        );
      }
      report.naturalKeyClashes.push(result);
    }

    // -----------------------------------------------------------------------
    heading("KẾT LUẬN");
    // -----------------------------------------------------------------------
    if (report.blockers.length === 0) {
      console.log("  ✅ Không phát hiện vấn đề chặn. Có thể chạy backup rồi backfill.");
    } else {
      console.log(`  ❌ Có ${report.blockers.length} vấn đề CHẶN cần xử lý trước:\n`);
      report.blockers.forEach((b, i) => console.log(`     ${i + 1}. ${b}`));
    }
    if (report.warnings.length) {
      console.log(`\n  ⚠️  ${report.warnings.length} cảnh báo:`);
      report.warnings.forEach((w, i) => console.log(`     ${i + 1}. ${w}`));
    }

    const outDir = ensureDir(path.join(__dirname, "out"));
    const outFile = path.join(outDir, `diagnose_${timestampSlug()}.json`);
    writeJson(outFile, report);
    console.log(`\n  📄 Báo cáo chi tiết: ${outFile}`);
    console.log("     → Gửi file này lại để phân tích tiếp.\n");
  } finally {
    await oldDb.end();
    await newDb.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Lỗi:", err);
  process.exit(1);
});
