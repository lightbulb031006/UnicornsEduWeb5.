/**
 * BƯỚC 8 — GIẢI ÁNH XẠ GIÁO VIÊN / HỌC SINH / LỚP (CHỈ ĐỌC)
 *
 * ID của teachers, students, classes đã bị sinh lại 100% khi migrate, nên phải
 * dựng lại ánh xạ bằng khoá tự nhiên. Riêng bảng users giữ nguyên 94% ID —
 * đó là cây cầu tốt nhất để nối hai bên.
 *
 * Đường ánh xạ giáo viên (ưu tiên từ trên xuống):
 *   1. old.users.link_id = teacher.id  →  user.id  →  new.staff_info.user_id
 *   2. teacher.email  →  new.users.email  →  new.staff_info.user_id
 *   3. teacher.full_name  →  new.users (first_name + last_name)
 *
 * Học sinh: new.student_info vẫn giữ full_name và email nên đối chiếu trực tiếp.
 *
 * Script này KHÔNG ghi gì.
 *
 * Chạy:  node 08-resolve-mapping.mjs
 */

import path from "node:path";
import {
  __dirname,
  loadEnv,
  connect,
  heading,
  ensureDir,
  timestampSlug,
  writeJson,
} from "./_lib.mjs";

const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const normEmail = (v) => String(v ?? "").trim().toLowerCase();

/** Tách tên thành tập từ để so khớp gần đúng. */
function tokens(name) {
  return new Set(
    norm(name)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );
}

function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

async function main() {
  heading("BƯỚC 8 — GIẢI ÁNH XẠ (CHỈ ĐỌC)");

  const { oldUrl, newUrl } = loadEnv();
  const oldDb = await connect(oldUrl, "DB CŨ  ");
  const newDb = await connect(newUrl, "DB MỚI ");

  const report = { generatedAt: new Date().toISOString() };

  try {
    // -----------------------------------------------------------------------
    heading("1. Kiểu dữ liệu khoá chính bên DB mới");
    // -----------------------------------------------------------------------
    const { rows: types } = await newDb.query(`
      SELECT table_name, column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name IN ('sessions','attendance')
        AND column_name='id'
    `);
    for (const t of types) {
      console.log(`  ${t.table_name}.id : ${t.data_type}   default=${t.column_default || "(không)"}`);
    }
    report.idTypes = types;

    // -----------------------------------------------------------------------
    heading("2. Giá trị enum / trạng thái cần chuyển đổi");
    // -----------------------------------------------------------------------
    const probes = [
      [oldDb, "CŨ", "SELECT DISTINCT payment_status::text AS v FROM sessions", "sessions.payment_status"],
      [oldDb, "CŨ", "SELECT DISTINCT present::text AS v FROM attendance", "attendance.present"],
      [oldDb, "CŨ", "SELECT DISTINCT status::text AS v FROM attendance", "attendance.status"],
      [newDb, "MỚI", "SELECT DISTINCT teacher_payment_status::text AS v FROM sessions", "sessions.teacher_payment_status"],
      [newDb, "MỚI", "SELECT DISTINCT status::text AS v FROM attendance", "attendance.status"],
    ];

    report.enumValues = {};
    for (const [db, label, sql, name] of probes) {
      try {
        const { rows } = await db.query(sql);
        const values = rows.map((r) => r.v);
        console.log(`  ${label}.${name.padEnd(34)} → ${values.join(", ") || "(rỗng)"}`);
        report.enumValues[`${label}.${name}`] = values;
      } catch (err) {
        console.log(`  ${label}.${name.padEnd(34)} → lỗi: ${err.message}`);
      }
    }

    // -----------------------------------------------------------------------
    heading("3. Ánh xạ GIÁO VIÊN");
    // -----------------------------------------------------------------------
    const { rows: oldTeachers } = await oldDb.query(
      `SELECT id, full_name, email, phone FROM teachers`
    );
    const { rows: oldUsers } = await oldDb.query(
      `SELECT id, email, name, link_id, role FROM users`
    );
    const { rows: newStaff } = await newDb.query(
      `SELECT si.id, si.user_id, u.email, u.first_name, u.last_name
       FROM staff_info si LEFT JOIN users u ON u.id = si.user_id`
    );

    const staffByUserId = new Map(newStaff.filter((s) => s.user_id).map((s) => [String(s.user_id), s]));
    const staffByEmail = new Map(newStaff.filter((s) => s.email).map((s) => [normEmail(s.email), s]));
    const staffByName = new Map(
      newStaff.map((s) => [norm(`${s.last_name || ""} ${s.first_name || ""}`), s])
    );
    const oldUserByLinkId = new Map(oldUsers.filter((u) => u.link_id).map((u) => [String(u.link_id), u]));
    const oldUserByEmail = new Map(oldUsers.filter((u) => u.email).map((u) => [normEmail(u.email), u]));

    const teacherMap = {};
    const teacherUnresolved = [];

    for (const t of oldTeachers) {
      let hit = null;
      let how = null;

      const linkedUser = oldUserByLinkId.get(String(t.id)) || oldUserByEmail.get(normEmail(t.email));
      if (linkedUser && staffByUserId.has(String(linkedUser.id))) {
        hit = staffByUserId.get(String(linkedUser.id));
        how = "qua users.id (ID được giữ nguyên)";
      }
      if (!hit && t.email && staffByEmail.has(normEmail(t.email))) {
        hit = staffByEmail.get(normEmail(t.email));
        how = "qua email";
      }
      if (!hit && t.full_name && staffByName.has(norm(t.full_name))) {
        hit = staffByName.get(norm(t.full_name));
        how = "qua họ tên";
      }

      if (hit) {
        teacherMap[t.id] = { newId: hit.id, how, name: t.full_name };
      } else {
        // thử khớp gần đúng để gợi ý
        let best = null;
        let bestScore = 0;
        for (const s of newStaff) {
          const score = similarity(t.full_name, `${s.last_name || ""} ${s.first_name || ""}`);
          if (score > bestScore) {
            bestScore = score;
            best = s;
          }
        }
        teacherUnresolved.push({
          oldId: t.id,
          name: t.full_name,
          email: t.email,
          suggestion:
            bestScore >= 0.5 && best
              ? { newId: best.id, name: `${best.last_name || ""} ${best.first_name || ""}`.trim(), score: Number(bestScore.toFixed(2)) }
              : null,
        });
      }
    }

    console.log(`  Giáo viên DB cũ      : ${oldTeachers.length}`);
    console.log(`  Ánh xạ được          : ${Object.keys(teacherMap).length}`);
    console.log(`  Chưa giải được       : ${teacherUnresolved.length}`);

    const byHow = {};
    for (const v of Object.values(teacherMap)) byHow[v.how] = (byHow[v.how] || 0) + 1;
    for (const [how, n] of Object.entries(byHow)) console.log(`     ${n} bản ghi ${how}`);

    for (const t of teacherUnresolved) {
      const s = t.suggestion
        ? `  → gợi ý: "${t.suggestion.name}" (${t.suggestion.newId}, khớp ${t.suggestion.score})`
        : "  → không có gợi ý";
      console.log(`     ❌ "${t.name}" (${t.oldId})${s}`);
    }

    report.teacherMap = teacherMap;
    report.teacherUnresolved = teacherUnresolved;

    // -----------------------------------------------------------------------
    heading("4. Ánh xạ HỌC SINH");
    // -----------------------------------------------------------------------
    const { rows: oldStudents } = await oldDb.query(
      `SELECT id, full_name, email, parent_phone, birth_year FROM students`
    );
    const { rows: newStudents } = await newDb.query(
      `SELECT id, full_name, email, parent_phone, birth_year FROM student_info`
    );

    const stuByEmail = new Map(newStudents.filter((s) => s.email).map((s) => [normEmail(s.email), s]));
    const stuByName = new Map();
    for (const s of newStudents) {
      const k = norm(s.full_name);
      if (!stuByName.has(k)) stuByName.set(k, []);
      stuByName.get(k).push(s);
    }

    const studentMap = {};
    const studentUnresolved = [];

    for (const s of oldStudents) {
      let hit = null;
      let how = null;

      if (s.email && stuByEmail.has(normEmail(s.email))) {
        hit = stuByEmail.get(normEmail(s.email));
        how = "qua email";
      }
      if (!hit) {
        const candidates = stuByName.get(norm(s.full_name)) || [];
        if (candidates.length === 1) {
          hit = candidates[0];
          how = "qua họ tên";
        } else if (candidates.length > 1) {
          const narrowed = candidates.filter(
            (c) => s.parent_phone && c.parent_phone === s.parent_phone
          );
          if (narrowed.length === 1) {
            hit = narrowed[0];
            how = "qua họ tên + SĐT phụ huynh";
          }
        }
      }

      if (hit) {
        studentMap[s.id] = { newId: hit.id, how, name: s.full_name };
      } else {
        let best = null;
        let bestScore = 0;
        for (const c of newStudents) {
          const score = similarity(s.full_name, c.full_name);
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        studentUnresolved.push({
          oldId: s.id,
          name: s.full_name,
          suggestion:
            bestScore >= 0.5 && best
              ? { newId: best.id, name: best.full_name, score: Number(bestScore.toFixed(2)) }
              : null,
        });
      }
    }

    console.log(`  Học sinh DB cũ       : ${oldStudents.length}`);
    console.log(`  Ánh xạ được          : ${Object.keys(studentMap).length}`);
    console.log(`  Chưa giải được       : ${studentUnresolved.length}`);

    const byHowStu = {};
    for (const v of Object.values(studentMap)) byHowStu[v.how] = (byHowStu[v.how] || 0) + 1;
    for (const [how, n] of Object.entries(byHowStu)) console.log(`     ${n} bản ghi ${how}`);

    for (const s of studentUnresolved) {
      const g = s.suggestion
        ? `  → gợi ý: "${s.suggestion.name}" (${s.suggestion.newId}, khớp ${s.suggestion.score})`
        : "  → không có gợi ý";
      console.log(`     ❌ "${s.name}" (${s.oldId})${g}`);
    }

    report.studentMap = studentMap;
    report.studentUnresolved = studentUnresolved;

    // -----------------------------------------------------------------------
    heading("5. Bốn lớp chưa ánh xạ — có bị đổi tên không?");
    // -----------------------------------------------------------------------
    const { rows: oc } = await oldDb.query(`SELECT id, name FROM classes`);
    const { rows: ncls } = await newDb.query(`SELECT id, name FROM classes`);
    const newNames = new Set(ncls.map((c) => norm(c.name)));
    const unmatchedOld = oc.filter((c) => !newNames.has(norm(c.name)));

    report.classSuggestions = [];

    for (const c of unmatchedOld) {
      const scored = ncls
        .map((n) => ({ ...n, score: similarity(c.name, n.name) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .filter((x) => x.score >= 0.3);

      console.log(`\n  ▸ "${c.name}"  (${c.id})`);
      if (scored.length === 0) {
        console.log("      không tìm thấy lớp nào tương tự bên DB mới");
      } else {
        for (const s of scored) {
          console.log(`      ~ "${s.name}"  (${s.id})  độ giống ${s.score.toFixed(2)}`);
        }
      }
      report.classSuggestions.push({ oldId: c.id, oldName: c.name, candidates: scored });
    }

    // -----------------------------------------------------------------------
    heading("KẾT LUẬN");
    // -----------------------------------------------------------------------
    const ok =
      teacherUnresolved.length === 0 && studentUnresolved.length === 0;
    if (ok) {
      console.log("  ✅ Ánh xạ giáo viên và học sinh đầy đủ — đủ điều kiện viết script chèn.");
    } else {
      console.log(
        `  ⚠️  Còn ${teacherUnresolved.length} giáo viên và ${studentUnresolved.length} học sinh chưa giải được.`
      );
      console.log("     Xem gợi ý ở trên để xác nhận thủ công.");
    }

    const outDir = ensureDir(path.join(__dirname, "out"));
    const file = writeJson(path.join(outDir, `mapping_${timestampSlug()}.json`), report);
    console.log(`\n  📄 Bảng ánh xạ: ${file}\n`);
  } finally {
    await oldDb.end();
    await newDb.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Lỗi:", err);
  process.exit(1);
});
