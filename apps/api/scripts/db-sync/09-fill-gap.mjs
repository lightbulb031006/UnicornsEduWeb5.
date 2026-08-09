/**
 * BƯỚC 9 — BÙ CÁC BUỔI HỌC THIẾU (ETL cũ → mới)
 *
 * Chuyển các buổi học (và điểm danh kèm theo) có ở DB cũ nhưng thiếu ở DB mới,
 * CHỈ với những lớp đã tồn tại ở DB mới và ánh xạ được 1-1 theo tên.
 *
 * NGUYÊN TẮC AN TOÀN:
 *  - Chỉ INSERT. Không UPDATE, không DELETE.
 *  - Bỏ qua buổi đã tồn tại (cùng lớp + cùng ngày) → chạy lại nhiều lần vẫn an toàn.
 *  - Một transaction duy nhất: lỗi giữa chừng thì rollback sạch.
 *  - Mặc định DRY RUN: chèn thật rồi ROLLBACK để xem trước kết quả.
 *  - Cột đích đọc trực tiếp từ DB mới, không tin vào schema Prisma trong repo
 *    (DB đang chạy có thể cũ hơn code).
 *
 * Chạy:
 *   node 09-fill-gap.mjs           # DRY RUN
 *   node 09-fill-gap.mjs --apply   # ghi thật
 */

import path from "node:path";
import crypto from "node:crypto";
import {
  __dirname,
  loadEnv,
  connect,
  heading,
  fmtNumber,
  ensureDir,
  timestampSlug,
  writeJson,
  quoteIdent,
} from "./_lib.mjs";

const APPLY = process.argv.includes("--apply");
const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const normEmail = (v) => String(v ?? "").trim().toLowerCase();

async function columnsOf(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [table]
  );
  return new Set(rows.map((r) => r.column_name));
}

/** Chỉ giữ những cột thật sự tồn tại ở bảng đích. */
function project(payload, allowedColumns) {
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    if (allowedColumns.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

async function insertRow(client, table, payload) {
  const cols = Object.keys(payload);
  const sql =
    `INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(", ")}) ` +
    `VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) ` +
    `ON CONFLICT DO NOTHING RETURNING id`;
  const res = await client.query(
    sql,
    cols.map((c) => payload[c])
  );
  return res.rows[0]?.id ?? null;
}

async function main() {
  heading(
    APPLY
      ? "BƯỚC 9 — BÙ BUỔI HỌC THIẾU (GHI THẬT — SẼ COMMIT)"
      : "BƯỚC 9 — BÙ BUỔI HỌC THIẾU (DRY RUN — chèn thử rồi ROLLBACK)"
  );

  const { oldUrl, newUrl } = loadEnv();
  const oldDb = await connect(oldUrl, "DB CŨ  ");
  const newDb = await connect(newUrl, "DB MỚI ");

  const summary = {
    startedAt: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    sessions: [],
    insertedIds: { sessions: [], attendance: [] },
    skipped: [],
  };

  let transactionOpen = false;

  try {
    // -----------------------------------------------------------------------
    heading("1. Dựng ánh xạ");
    // -----------------------------------------------------------------------

    // --- Lớp: theo tên, chỉ nhận khớp 1-1 ---
    const { rows: oldClasses } = await oldDb.query(`SELECT id, name FROM classes`);
    const { rows: newClasses } = await newDb.query(`SELECT id, name FROM classes`);

    const newClassByName = new Map();
    for (const c of newClasses) {
      const k = norm(c.name);
      if (!newClassByName.has(k)) newClassByName.set(k, []);
      newClassByName.get(k).push(c.id);
    }

    const classMap = new Map();
    for (const c of oldClasses) {
      const hits = newClassByName.get(norm(c.name)) || [];
      if (hits.length === 1) classMap.set(c.id, hits[0]);
    }
    console.log(`  Lớp ánh xạ 1-1 : ${classMap.size}/${oldClasses.length}`);

    // --- Giáo viên: qua users.id giữ nguyên → email → họ tên ---
    const { rows: oldTeachers } = await oldDb.query(`SELECT id, full_name, email FROM teachers`);
    const { rows: oldUsers } = await oldDb.query(`SELECT id, email, link_id FROM users`);
    const { rows: newStaff } = await newDb.query(
      `SELECT si.id, si.user_id, u.email, u.first_name, u.last_name
       FROM staff_info si LEFT JOIN users u ON u.id = si.user_id`
    );

    const staffByUserId = new Map(newStaff.filter((s) => s.user_id).map((s) => [String(s.user_id), s.id]));
    const staffByEmail = new Map(newStaff.filter((s) => s.email).map((s) => [normEmail(s.email), s.id]));
    const staffByName = new Map(
      newStaff.map((s) => [norm(`${s.last_name || ""} ${s.first_name || ""}`), s.id])
    );
    const oldUserByLink = new Map(oldUsers.filter((u) => u.link_id).map((u) => [String(u.link_id), u]));
    const oldUserByEmail = new Map(oldUsers.filter((u) => u.email).map((u) => [normEmail(u.email), u]));

    const teacherMap = new Map();
    for (const t of oldTeachers) {
      const linked = oldUserByLink.get(String(t.id)) || oldUserByEmail.get(normEmail(t.email));
      const hit =
        (linked && staffByUserId.get(String(linked.id))) ||
        staffByEmail.get(normEmail(t.email)) ||
        staffByName.get(norm(t.full_name));
      if (hit) teacherMap.set(String(t.id), hit);
    }
    console.log(`  Giáo viên      : ${teacherMap.size}/${oldTeachers.length}`);

    // --- Học sinh: email → họ tên duy nhất ---
    const { rows: oldStudents } = await oldDb.query(
      `SELECT id, full_name, email, parent_phone FROM students`
    );
    const { rows: newStudents } = await newDb.query(
      `SELECT id, full_name, email, parent_phone FROM student_info`
    );

    const stuByEmail = new Map(newStudents.filter((s) => s.email).map((s) => [normEmail(s.email), s.id]));
    const stuByName = new Map();
    for (const s of newStudents) {
      const k = norm(s.full_name);
      if (!stuByName.has(k)) stuByName.set(k, []);
      stuByName.get(k).push(s);
    }

    const studentMap = new Map();
    for (const s of oldStudents) {
      let hit = stuByEmail.get(normEmail(s.email));
      if (!hit) {
        const cands = stuByName.get(norm(s.full_name)) || [];
        if (cands.length === 1) hit = cands[0].id;
        else if (cands.length > 1) {
          const narrowed = cands.filter((c) => s.parent_phone && c.parent_phone === s.parent_phone);
          if (narrowed.length === 1) hit = narrowed[0].id;
        }
      }
      if (hit) studentMap.set(String(s.id), hit);
    }
    console.log(`  Học sinh       : ${studentMap.size}/${oldStudents.length}`);

    // -----------------------------------------------------------------------
    heading("2. Xác định buổi học cần bù");
    // -----------------------------------------------------------------------
    const { rows: oldSessions } = await oldDb.query(
      `SELECT id, class_id, teacher_id, date::text AS date, start_time::text AS start_time,
              end_time::text AS end_time, coefficient, notes, payment_status,
              allowance_amount, tuition_fee,
              created_at::text AS created_at, updated_at::text AS updated_at
       FROM sessions ORDER BY date`
    );
    const { rows: newSessions } = await newDb.query(
      `SELECT class_id, date::text AS date FROM sessions`
    );
    const existingKeys = new Set(newSessions.map((s) => `${s.class_id}|${s.date}`));

    const todo = [];
    for (const s of oldSessions) {
      const newClassId = classMap.get(s.class_id);
      if (!newClassId) continue; // lớp không ánh xạ được — xử lý riêng
      if (existingKeys.has(`${newClassId}|${s.date}`)) continue; // đã có
      const newTeacherId = teacherMap.get(String(s.teacher_id));
      if (!newTeacherId) {
        summary.skipped.push({ oldSessionId: s.id, date: s.date, reason: "không ánh xạ được giáo viên" });
        continue;
      }
      todo.push({ ...s, newClassId, newTeacherId });
    }

    console.log(`  Buổi cần bù : ${fmtNumber(todo.length)}`);
    if (summary.skipped.length) {
      console.log(`  Bỏ qua      : ${fmtNumber(summary.skipped.length)} (thiếu ánh xạ giáo viên)`);
    }

    if (todo.length === 0) {
      console.log("\n  Không có gì để bù. Kết thúc.\n");
      return;
    }

    const byMonth = {};
    for (const s of todo) byMonth[s.date.slice(0, 7)] = (byMonth[s.date.slice(0, 7)] || 0) + 1;
    for (const m of Object.keys(byMonth).sort()) console.log(`     ${m} : ${byMonth[m]} buổi`);

    // -----------------------------------------------------------------------
    heading("3. Chèn dữ liệu");
    // -----------------------------------------------------------------------
    const sessionCols = await columnsOf(newDb, "sessions");
    const attendanceCols = await columnsOf(newDb, "attendance");

    await newDb.query("BEGIN");
    transactionOpen = true;

    let insertedSessions = 0;
    let insertedAttendance = 0;

    for (const s of todo) {
      const newSessionId = crypto.randomUUID();

      const sessionPayload = project(
        {
          id: newSessionId,
          class_id: s.newClassId,
          teacher_id: s.newTeacherId,
          date: s.date,
          start_time: s.start_time,
          end_time: s.end_time,
          coefficient: s.coefficient,
          notes: s.notes,
          lesson_content: s.notes, // web mới hiển thị nội dung bài học ở cột này
          teacher_payment_status: s.payment_status, // paid/unpaid khớp 1-1
          allowance_amount: s.allowance_amount,
          tuition_fee: s.tuition_fee,
          created_at: s.created_at,
          updated_at: s.updated_at,
        },
        sessionCols
      );

      const gotId = await insertRow(newDb, "sessions", sessionPayload);
      if (!gotId) {
        summary.skipped.push({ oldSessionId: s.id, date: s.date, reason: "bị chặn bởi ON CONFLICT" });
        continue;
      }

      insertedSessions++;
      summary.insertedIds.sessions.push(newSessionId);

      // --- điểm danh của buổi này ---
      const { rows: oldAtt } = await oldDb.query(
        `SELECT id, student_id, status::text AS status, present::text AS present,
                remark, created_at::text AS created_at
         FROM attendance WHERE session_id = $1`,
        [s.id]
      );

      const attInserted = [];
      for (const a of oldAtt) {
        const newStudentId = studentMap.get(String(a.student_id));
        if (!newStudentId) {
          summary.skipped.push({
            oldAttendanceId: a.id,
            reason: "không ánh xạ được học sinh",
          });
          continue;
        }

        // Quy đổi trạng thái: ưu tiên cột status, fallback theo present
        const status = a.status || (a.present === "true" ? "present" : "absent");

        const attId = crypto.randomUUID();
        const attPayload = project(
          {
            id: attId,
            session_id: newSessionId,
            student_id: newStudentId,
            status,
            notes: a.remark,
            tuition_fee: s.tuition_fee,
            created_at: a.created_at,
          },
          attendanceCols
        );

        const ok = await insertRow(newDb, "attendance", attPayload);
        if (ok) {
          insertedAttendance++;
          attInserted.push(attId);
          summary.insertedIds.attendance.push(attId);
        }
      }

      summary.sessions.push({
        oldId: s.id,
        newId: newSessionId,
        date: s.date,
        classId: s.newClassId,
        teacherId: s.newTeacherId,
        attendance: attInserted.length,
      });

      console.log(
        `  ➕ ${s.date}  lớp ${s.newClassId}  → ${attInserted.length} điểm danh`
      );
    }

    // -----------------------------------------------------------------------
    heading("TỔNG KẾT");
    // -----------------------------------------------------------------------
    console.log(`  Buổi học chèn : ${fmtNumber(insertedSessions)}`);
    console.log(`  Điểm danh chèn: ${fmtNumber(insertedAttendance)}`);
    console.log(`  Bỏ qua        : ${fmtNumber(summary.skipped.length)}`);

    summary.totalSessions = insertedSessions;
    summary.totalAttendance = insertedAttendance;
    summary.finishedAt = new Date().toISOString();

    const outDir = ensureDir(path.join(__dirname, "out"));
    const stamp = timestampSlug();

    if (APPLY) {
      await newDb.query("COMMIT");
      transactionOpen = false;
      const file = writeJson(path.join(outDir, `fillgap_applied_${stamp}.json`), summary);
      console.log("\n  ✅ ĐÃ COMMIT.");
      console.log(`  📄 Nhật ký: ${file}`);
      console.log("     Giữ file này để hoàn tác nếu cần: node 10-undo-fill.mjs <file>");
    } else {
      await newDb.query("ROLLBACK");
      transactionOpen = false;
      const file = writeJson(path.join(outDir, `fillgap_dryrun_${stamp}.json`), summary);
      console.log("\n  🏷️  DRY RUN — đã ROLLBACK, DB mới KHÔNG thay đổi.");
      console.log(`  📄 Báo cáo: ${file}`);
      console.log("     Nếu số liệu hợp lý, chạy lại với --apply");
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

main().catch((err) => {
  console.error("\n❌ Lỗi:", err);
  process.exit(1);
});
