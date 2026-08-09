/**
 * BƯỚC 0 — TEST KẾT NỐI
 *
 * Thử từng chuỗi kết nối một cách độc lập và báo rõ cái nào hỏng, hỏng vì sao.
 * Không đọc dữ liệu nghiệp vụ, không ghi gì.
 *
 * Chạy:  node 00-test-connection.mjs
 */

import { pg, loadEnv, maskUrl, heading } from "./_lib.mjs";

function explain(err) {
  const message = err.message || String(err);

  if (/tenant.*not found/i.test(message)) {
    return [
      "Pooler của vùng này không quản project đó.",
      "→ Sai hostname vùng. Kiểm tra lại phần `aws-0-<region>` / `aws-1-<region>`.",
      "→ Cách chắc ăn: copy nguyên chuỗi từ nút Connect trên dashboard của ĐÚNG project.",
      "→ Cũng có thể project đang bị Supabase tạm dừng (paused) — vào dashboard bấm Restore.",
    ];
  }
  if (/password authentication failed/i.test(message)) {
    return [
      "Hostname và project đúng, nhưng sai mật khẩu.",
      "→ Nếu mật khẩu có ký tự đặc biệt (@ # ? / % :) thì phải mã hoá URL.",
      "→ Ví dụ ký tự @ phải viết thành %40.",
    ];
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return [
      "Không phân giải được tên miền — hostname gõ sai hoặc mạng chặn.",
      "→ Kiểm tra chính tả phần sau dấu @.",
    ];
  }
  if (/ETIMEDOUT|ECONNREFUSED/i.test(message)) {
    return [
      "Không kết nối được tới cổng.",
      "→ Kiểm tra cổng phải là 5432 (Session pooler), không phải 6543.",
    ];
  }
  if (/self.signed|certificate/i.test(message)) {
    return ["Vấn đề chứng chỉ TLS — hiếm gặp với Supabase."];
  }
  return ["→ Copy lại nguyên chuỗi từ dashboard rồi thử lại."];
}

async function test(label, url) {
  console.log(`\n  ${label}`);
  console.log(`  ${maskUrl(url)}`);

  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });

  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT current_database() AS db,
             (SELECT count(*) FROM information_schema.tables
               WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS so_bang
    `);
    console.log(`  ✅ KẾT NỐI ĐƯỢC — database "${rows[0].db}", ${rows[0].so_bang} bảng trong schema public`);

    // Vài bảng đặc trưng để nhận diện schema cũ hay mới
    const { rows: probe } = await client.query(`
      SELECT
        to_regclass('public.staff_info')  IS NOT NULL AS co_staff_info,
        to_regclass('public.student_info') IS NOT NULL AS co_student_info,
        to_regclass('public.teachers')     IS NOT NULL AS co_teachers,
        to_regclass('public.students')     IS NOT NULL AS co_students
    `);
    const p = probe[0];
    if (p.co_staff_info && p.co_student_info) {
      console.log("  🆕 Đây là schema MỚI (có staff_info, student_info)");
    } else if (p.co_teachers && p.co_students) {
      console.log("  🕰️  Đây là schema CŨ (có teachers, students)");
    } else {
      console.log("  ❔ Không nhận ra schema — cần xem kỹ hơn");
    }

    await client.end();
    return true;
  } catch (err) {
    console.log(`  ❌ THẤT BẠI: ${err.message}`);
    for (const line of explain(err)) console.log(`     ${line}`);
    try {
      await client.end();
    } catch {}
    return false;
  }
}

async function main() {
  heading("BƯỚC 0 — TEST KẾT NỐI HAI DATABASE");

  const { oldUrl, newUrl } = loadEnv();

  const okOld = await test("OLD_DATABASE_URL", oldUrl);
  const okNew = await test("NEW_DATABASE_URL", newUrl);

  heading("KẾT QUẢ");
  console.log(`  OLD: ${okOld ? "✅ ổn" : "❌ chưa được"}`);
  console.log(`  NEW: ${okNew ? "✅ ổn" : "❌ chưa được"}`);

  if (okOld && okNew) {
    console.log("\n  Cả hai đều ổn. Chạy tiếp: node 01-diagnose.mjs\n");
  } else {
    console.log("\n  Sửa chuỗi còn lỗi trong apps/api/scripts/.env.migration rồi chạy lại lệnh này.\n");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("\n❌ Lỗi:", err);
  process.exit(1);
});
