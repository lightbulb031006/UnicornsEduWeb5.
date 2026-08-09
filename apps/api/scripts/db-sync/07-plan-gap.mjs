/**
 * BƯỚC 7 — LẬP KẾ HOẠCH BÙ DỮ LIỆU THIẾU (CHỈ ĐỌC)
 *
 * Bối cảnh: cuộc migrate trước đây dừng khoảng 22/06/2026. Các buổi học nhập
 * vào web cũ sau mốc đó chưa được chuyển sang DB mới. Hai schema khác nhau và
 * ID lớp đã bị sinh lại, nên phải dựng ánh xạ trước khi chèn bất cứ thứ gì.
 *
 * Script này KHÔNG ghi gì. Nó trả lời 4 câu hỏi:
 *   1. ID của giáo viên / học sinh có được giữ nguyên khi migrate không?
 *   2. Ánh xạ lớp theo tên có sạch không (1-1, không trùng, không sót)?
 *   3. Chính xác những buổi học nào đang thiếu?
 *   4. Điểm danh của các buổi đó có ánh xạ được học sinh không?
 *
 * Chạy:  node 07-plan-gap.mjs
 */

import path from "node:path";
import {
  __dirname,
  loadEnv,
  connect,
  heading,
  fmtNumber,
  ensureDir,
  timestampSlug,
  writeJson,
} from "./_lib.mjs";

const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

async function columnsOf(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((r) => r.column_name);
}

async function idsOf(client, table, col = "id") {
  const { rows } = await client.query(`SELECT ${col} AS id FROM ${table}`);
  return new Set(rows.map((r) => String(r.id)));
}

function overlap(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

async function main() {
  heading("BƯỚC 7 — LẬP KẾ HOẠCH BÙ DỮ LIỆU (CHỈ ĐỌC)");

  const { oldUrl, newUrl } = loadEnv();
  const oldDb = await connect(oldUrl, "DB CŨ  ");
  const newDb = await connect(newUrl, "DB MỚI ");

  const report = { generatedAt: new Date().toISOString() };

  try {
    // -----------------------------------------------------------------------
    heading("1. Cấu trúc cột các bảng liên quan");
    // -----------------------------------------------------------------------
    const schema = {};
    for (const [db, label, tables] of [
      [oldDb, "CŨ", ["users", "teachers", "students", "classes", "sessions", "attendance"]],
      [newDb, "MỚI", ["users", "staff_info", "student_info", "classes", "sessions", "attendance"]],
    ]) {
      for (const t of tables) {
        const cols = await columnsOf(db, t);
        schema[`${label}.${t}`] = cols;
        if (cols.length) console.log(`  ${label}.${t}\n     ${cols.join(", ")}`);
      }
    }
    report.schema = schema;

    // -----------------------------------------------------------------------
    heading("2. ID có được bảo toàn khi migrate không?");
    // -----------------------------------------------------------------------
    const oldUsers = await idsOf(oldDb, "users");
    const newUsers = await idsOf(newDb, "users");
    const oldTeachers = await idsOf(oldDb, "teachers");
    const newStaff = await idsOf(newDb, "staff_info");
    const oldStudents = await idsOf(oldDb, "students");
    const newStudentInfo = await idsOf(newDb, "student_info");
    const oldClasses = await idsOf(oldDb, "classes");
    const newClasses = await idsOf(newDb, "classes");

    const checks = [
      ["users → users", oldUsers, newUsers],
      ["teachers → staff_info", oldTeachers, newStaff],
      ["students → student_info", oldStudents, newStudentInfo],
      ["classes → classes", oldClasses, newClasses],
    ];

    report.idPreservation = {};
    for (const [label, a, b] of checks) {
      const n = overlap(a, b);
      const pct = a.size ? Math.round((n / a.size) * 100) : 0;
      const verdict = pct >= 90 ? "✅ GIỮ NGUYÊN ID" : pct === 0 ? "❌ ĐỔI ID HOÀN TOÀN" : "⚠️  GIỮ MỘT PHẦN";
      console.log(
        `  ${label.padEnd(26)} ${String(n).padStart(4)}/${String(a.size).padEnd(4)} trùng (${pct}%)  ${verdict}`
      );
      report.idPreservation[label] = { matched: n, total: a.size, percent: pct };
    }

    // -----------------------------------------------------------------------
    heading("3. Ánh xạ lớp theo tên");
    // -----------------------------------------------------------------------
    const { rows: oc } = await oldDb.query(`SELECT id, name FROM classes`);
    const { rows: nc } = await newDb.query(`SELECT id, name FROM classes`);

    const newByName = new Map();
    for (const c of nc) {
      const k = norm(c.name);
      if (!newByName.has(k)) newByName.set(k, []);
      newByName.get(k).push(c.id);
    }

    const classMap = {};
    const unmatched = [];
    const ambiguous = [];

    for (const c of oc) {
      const hits = newByName.get(norm(c.name)) || [];
      if (hits.length === 1) classMap[c.id] = hits[0];
      else if (hits.length === 0) unmatched.push(c);
      else ambiguous.push({ ...c, hits });
    }

    console.log(`  Lớp DB cũ            : ${oc.length}`);
    console.log(`  Lớp DB mới           : ${nc.length}`);
    console.log(`  Ánh xạ được 1-1      : ${Object.keys(classMap).length}`);
    console.log(`  Không có bên mới     : ${unmatched.length}`);
    console.log(`  Trùng tên nhiều bản  : ${ambiguous.length}`);

    for (const c of unmatched) console.log(`     ❌ "${c.name}" (${c.id})`);
    for (const c of ambiguous) console.log(`     ⚠️  "${c.name}" khớp ${c.hits.length} lớp mới`);

    report.classMap = classMap;
    report.classUnmatched = unmatched;
    report.classAmbiguous = ambiguous;

    // -----------------------------------------------------------------------
    heading("4. Buổi học thiếu ở DB mới");
    // -----------------------------------------------------------------------
    const { rows: oldSessions } = await oldDb.query(
      `SELECT id, class_id, teacher_id, date::text AS date FROM sessions ORDER BY date`
    );
    const { rows: newSessions } = await newDb.query(
      `SELECT id, class_id, date::text AS date FROM sessions`
    );

    // khoá tự nhiên: lớp (đã ánh xạ) + ngày
    const newKeys = new Set(newSessions.map((s) => `${s.class_id}|${s.date}`));

    const missing = [];
    const missingNoClassMap = [];

    for (const s of oldSessions) {
      const mappedClass = classMap[s.class_id];
      if (!mappedClass) {
        missingNoClassMap.push(s);
        continue;
      }
      if (!newKeys.has(`${mappedClass}|${s.date}`)) {
        missing.push({ ...s, newClassId: mappedClass });
      }
    }

    const byMonth = {};
    for (const s of missing) {
      const m = s.date.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + 1;
    }

    console.log(`  Buổi học ở DB cũ            : ${fmtNumber(oldSessions.length)}`);
    console.log(`  Thiếu ở DB mới             : ${fmtNumber(missing.length)}`);
    console.log(`  Không ánh xạ được lớp      : ${fmtNumber(missingNoClassMap.length)}`);
    console.log("\n  Phân bố theo tháng:");
    for (const m of Object.keys(byMonth).sort()) {
      console.log(`     ${m} : ${fmtNumber(byMonth[m])} buổi`);
    }

    if (missing.length) {
      const dates = missing.map((s) => s.date).sort();
      console.log(`\n  Khoảng ngày thiếu: ${dates[0]} → ${dates[dates.length - 1]}`);
    }

    report.missingSessions = missing;
    report.missingByMonth = byMonth;
    report.missingNoClassMap = missingNoClassMap;

    // -----------------------------------------------------------------------
    heading("5. Giáo viên của các buổi thiếu");
    // -----------------------------------------------------------------------
    const neededTeachers = [...new Set(missing.map((s) => s.teacher_id).filter(Boolean))];
    const teacherOk = neededTeachers.filter((t) => newStaff.has(String(t)));
    const teacherMissing = neededTeachers.filter((t) => !newStaff.has(String(t)));

    console.log(`  Giáo viên liên quan        : ${neededTeachers.length}`);
    console.log(`  Đã có ở DB mới (cùng ID)   : ${teacherOk.length}`);
    console.log(`  Chưa có / khác ID          : ${teacherMissing.length}`);
    for (const t of teacherMissing) console.log(`     ❌ ${t}`);

    report.teachersNeeded = neededTeachers;
    report.teachersMissing = teacherMissing;

    // -----------------------------------------------------------------------
    heading("6. Điểm danh của các buổi thiếu");
    // -----------------------------------------------------------------------
    let attendanceRows = [];
    if (missing.length) {
      const ids = missing.map((s) => s.id);
      const { rows } = await oldDb.query(
        `SELECT id, session_id, student_id FROM attendance WHERE session_id = ANY($1::text[])`,
        [ids.map(String)]
      );
      attendanceRows = rows;
    }

    const neededStudents = [...new Set(attendanceRows.map((a) => String(a.student_id)))];
    const studentOk = neededStudents.filter((s) => newStudentInfo.has(s));
    const studentMissing = neededStudents.filter((s) => !newStudentInfo.has(s));

    console.log(`  Bản ghi điểm danh cần bù   : ${fmtNumber(attendanceRows.length)}`);
    console.log(`  Học sinh liên quan         : ${neededStudents.length}`);
    console.log(`  Đã có ở DB mới (cùng ID)   : ${studentOk.length}`);
    console.log(`  Chưa có / khác ID          : ${studentMissing.length}`);
    for (const s of studentMissing.slice(0, 20)) console.log(`     ❌ ${s}`);

    report.attendanceToFill = attendanceRows.length;
    report.studentsMissing = studentMissing;

    // -----------------------------------------------------------------------
    heading("KẾT LUẬN");
    // -----------------------------------------------------------------------
    const blockers = [];
    if (unmatched.length) blockers.push(`${unmatched.length} lớp không ánh xạ được`);
    if (ambiguous.length) blockers.push(`${ambiguous.length} lớp trùng tên`);
    if (teacherMissing.length) blockers.push(`${teacherMissing.length} giáo viên chưa có ở DB mới`);
    if (studentMissing.length) blockers.push(`${studentMissing.length} học sinh chưa có ở DB mới`);

    console.log(`  Cần bù: ${fmtNumber(missing.length)} buổi học + ${fmtNumber(attendanceRows.length)} điểm danh`);
    if (blockers.length === 0) {
      console.log("  ✅ Mọi thứ ánh xạ sạch — có thể viết script chèn an toàn.");
    } else {
      console.log(`  ⚠️  Cần xử lý trước: ${blockers.join("; ")}`);
    }

    const outDir = ensureDir(path.join(__dirname, "out"));
    const file = writeJson(path.join(outDir, `plan_gap_${timestampSlug()}.json`), report);
    console.log(`\n  📄 Kế hoạch chi tiết: ${file}\n`);
  } finally {
    await oldDb.end();
    await newDb.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Lỗi:", err);
  process.exit(1);
});
