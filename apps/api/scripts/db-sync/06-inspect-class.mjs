/**
 * TRA CỨU MỘT LỚP Ở CẢ HAI DATABASE (CHỈ ĐỌC)
 *
 * So sánh danh sách buổi học của cùng một lớp giữa DB cũ và DB mới,
 * chỉ ra chính xác ngày nào có bên cũ mà thiếu bên mới.
 *
 * Chạy:
 *   node 06-inspect-class.mjs                  # mặc định tìm lớp có chữ "IKMC"
 *   node 06-inspect-class.mjs --name=Tuấn
 *   node 06-inspect-class.mjs --name=Toán 12
 */

import { loadEnv, connect, heading, fmtNumber } from "./_lib.mjs";

const nameArg = process.argv.find((a) => a.startsWith("--name="));
const NAME = nameArg ? nameArg.slice("--name=".length) : "IKMC";

async function inspect(client, label) {
  const { rows: classes } = await client.query(
    `SELECT c.id,
            c.name,
            count(s.id)::int AS so_buoi,
            min(s.date)::text AS buoi_dau,
            max(s.date)::text AS buoi_cuoi
     FROM classes c
     LEFT JOIN sessions s ON s.class_id = c.id
     WHERE c.name ILIKE $1
     GROUP BY c.id, c.name
     ORDER BY c.name`,
    [`%${NAME}%`]
  );

  console.log(`\n  ${label} — ${classes.length} lớp khớp "${NAME}"`);
  if (classes.length === 0) {
    console.log("    (không tìm thấy lớp nào)");
    return new Map();
  }

  const result = new Map();

  for (const cls of classes) {
    console.log(
      `\n    ▸ "${cls.name}"` +
        `\n      id      : ${cls.id}` +
        `\n      số buổi : ${fmtNumber(cls.so_buoi)}` +
        (cls.so_buoi > 0 ? `\n      khoảng  : ${cls.buoi_dau} → ${cls.buoi_cuoi}` : "")
    );

    const { rows: sessions } = await client.query(
      `SELECT id, date::text AS date, teacher_id
       FROM sessions WHERE class_id = $1 ORDER BY date`,
      [cls.id]
    );

    if (sessions.length) {
      console.log("      ngày    : " + sessions.map((s) => s.date).join(", "));
    }

    result.set(cls.name.trim().toLowerCase(), {
      ...cls,
      dates: sessions.map((s) => s.date),
    });
  }

  return result;
}

async function main() {
  heading(`TRA CỨU LỚP CHỨA "${NAME}" Ở CẢ HAI DATABASE`);

  const { oldUrl, newUrl } = loadEnv();
  const oldDb = await connect(oldUrl, "DB CŨ  ");
  const newDb = await connect(newUrl, "DB MỚI ");

  try {
    const oldClasses = await inspect(oldDb, "DB CŨ");
    const newClasses = await inspect(newDb, "DB MỚI");

    heading("ĐỐI CHIẾU THEO TÊN LỚP");

    let anyGap = false;

    for (const [key, oldCls] of oldClasses) {
      const newCls = newClasses.get(key);

      if (!newCls) {
        console.log(`\n  ❌ "${oldCls.name}" — KHÔNG có ở DB mới (${oldCls.so_buoi} buổi bên cũ)`);
        anyGap = true;
        continue;
      }

      const newDates = new Set(newCls.dates);
      const missing = oldCls.dates.filter((d) => !newDates.has(d));
      const extra = newCls.dates.filter((d) => !new Set(oldCls.dates).has(d));

      console.log(`\n  ▸ "${oldCls.name}"`);
      console.log(`      DB cũ : ${fmtNumber(oldCls.so_buoi)} buổi   (id ${oldCls.id})`);
      console.log(`      DB mới: ${fmtNumber(newCls.so_buoi)} buổi   (id ${newCls.id})`);

      if (missing.length === 0) {
        console.log("      ✅ DB mới có đủ mọi ngày của DB cũ");
      } else {
        anyGap = true;
        console.log(`      ❌ THIẾU ${missing.length} ngày ở DB mới: ${missing.join(", ")}`);
      }

      if (extra.length) {
        console.log(`      ➕ DB mới có thêm ${extra.length} ngày: ${extra.join(", ")}`);
      }
    }

    heading("KẾT LUẬN");
    if (anyGap) {
      console.log("  ❌ Có buổi học thiếu thật ở DB mới — cần bù đúng phần thiếu.");
    } else {
      console.log("  ✅ DB mới đã có đủ dữ liệu. Vấn đề nằm ở phía hiển thị của web,");
      console.log("     không phải ở database.");
    }
    console.log("");
  } finally {
    await oldDb.end();
    await newDb.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Lỗi:", err);
  process.exit(1);
});
