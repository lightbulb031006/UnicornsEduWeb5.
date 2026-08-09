/**
 * BƯỚC 10 (chỉ khi cần) — HOÀN TÁC BƯỚC 9
 *
 * Xoá chính xác các buổi học và điểm danh mà 09-fill-gap.mjs đã chèn,
 * đọc từ file fillgap_applied_*.json. Không đụng bản ghi nào khác.
 *
 * Chạy:
 *   node 10-undo-fill.mjs out/fillgap_applied_....json           # xem trước
 *   node 10-undo-fill.mjs out/fillgap_applied_....json --apply   # xoá thật
 */

import fs from "node:fs";
import path from "node:path";
import { loadEnv, connect, heading, fmtNumber, chunk } from "./_lib.mjs";

const APPLY = process.argv.includes("--apply");
const logPath = process.argv.slice(2).find((a) => !a.startsWith("--"));

async function main() {
  if (!logPath) {
    console.error("❌ Thiếu đường dẫn file nhật ký fillgap_applied_*.json");
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), logPath);
  if (!fs.existsSync(resolved)) {
    console.error(`❌ Không thấy file: ${resolved}`);
    process.exit(1);
  }

  const log = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (log.mode !== "apply") {
    console.error("❌ File này là DRY RUN — không có gì để hoàn tác.");
    process.exit(1);
  }

  const sessionIds = log.insertedIds?.sessions ?? [];
  const attendanceIds = log.insertedIds?.attendance ?? [];

  heading(APPLY ? "HOÀN TÁC (XOÁ THẬT)" : "HOÀN TÁC (DRY RUN)");
  console.log(`  Nhật ký    : ${resolved}`);
  console.log(`  Buổi học   : ${fmtNumber(sessionIds.length)}`);
  console.log(`  Điểm danh  : ${fmtNumber(attendanceIds.length)}`);

  if (sessionIds.length === 0 && attendanceIds.length === 0) {
    console.log("\n  Không có gì để xoá.\n");
    return;
  }

  const { newUrl } = loadEnv();
  const newDb = await connect(newUrl, "DB MỚI ");
  let transactionOpen = false;

  try {
    await newDb.query("BEGIN");
    transactionOpen = true;

    // Xoá điểm danh trước (con), rồi buổi học (cha)
    let delAtt = 0;
    for (const batch of chunk(attendanceIds, 500)) {
      const res = await newDb.query(`DELETE FROM attendance WHERE id = ANY($1::text[])`, [batch]);
      delAtt += res.rowCount ?? 0;
    }

    let delSess = 0;
    for (const batch of chunk(sessionIds, 500)) {
      const res = await newDb.query(`DELETE FROM sessions WHERE id = ANY($1::text[])`, [batch]);
      delSess += res.rowCount ?? 0;
    }

    heading("KẾT QUẢ");
    console.log(`  Điểm danh xoá : ${fmtNumber(delAtt)} / ${fmtNumber(attendanceIds.length)}`);
    console.log(`  Buổi học xoá  : ${fmtNumber(delSess)} / ${fmtNumber(sessionIds.length)}`);

    if (APPLY) {
      await newDb.query("COMMIT");
      transactionOpen = false;
      console.log("\n  ✅ ĐÃ COMMIT — đã hoàn tác xong.\n");
    } else {
      await newDb.query("ROLLBACK");
      transactionOpen = false;
      console.log("\n  🏷️  DRY RUN — đã ROLLBACK, chưa xoá gì thật.");
      console.log("     Thêm --apply nếu thực sự muốn hoàn tác.\n");
    }
  } catch (err) {
    if (transactionOpen) {
      try {
        await newDb.query("ROLLBACK");
      } catch {}
    }
    throw err;
  } finally {
    await newDb.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Lỗi:", err);
  process.exit(1);
});
