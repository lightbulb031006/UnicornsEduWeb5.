/**
 * BƯỚC 2 — BACKUP CẢ HAI DATABASE (CHỈ ĐỌC)
 *
 * Dump toàn bộ bảng của DB cũ và DB mới ra file JSONL (mỗi dòng 1 bản ghi),
 * kèm manifest ghi số dòng để đối chiếu. Không cần cài pg_dump.
 *
 * Mọi giá trị ngày/giờ/json được giữ nguyên dạng text như trong Postgres,
 * nên backup này khôi phục lại đúng bit-for-bit về mặt dữ liệu.
 *
 * Chạy:  node 02-backup.mjs
 */

import fs from "node:fs";
import path from "node:path";
import {
  __dirname,
  loadEnv,
  connect,
  listTables,
  listPrimaryKeys,
  fmtNumber,
  heading,
  ensureDir,
  timestampSlug,
  writeJson,
  quoteIdent,
} from "./_lib.mjs";

const PAGE_SIZE = 5000;

async function dumpDatabase(client, label, outDir) {
  ensureDir(outDir);

  const tables = await listTables(client);
  const pks = await listPrimaryKeys(client);
  const manifest = { label, dumpedAt: new Date().toISOString(), tables: {} };

  console.log(`\n  ${label} → ${outDir}`);

  for (const table of tables) {
    const pkColumns = pks.get(table);
    const orderBy = pkColumns?.length
      ? `ORDER BY ${pkColumns.map(quoteIdent).join(", ")}`
      : "";

    const filePath = path.join(outDir, `${table}.jsonl`);
    const stream = fs.createWriteStream(filePath, { encoding: "utf8" });

    let offset = 0;
    let rowCount = 0;

    for (;;) {
      const { rows } = await client.query(
        `SELECT * FROM ${quoteIdent(table)} ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`
      );
      if (rows.length === 0) break;

      for (const row of rows) {
        stream.write(JSON.stringify(row) + "\n");
      }

      rowCount += rows.length;
      offset += PAGE_SIZE;
      if (rows.length < PAGE_SIZE) break;
    }

    await new Promise((resolve, reject) => {
      stream.end(resolve);
      stream.on("error", reject);
    });

    manifest.tables[table] = rowCount;
    const sizeKb = (fs.statSync(filePath).size / 1024).toFixed(0);
    console.log(`    ${table.padEnd(40)}${fmtNumber(rowCount).padStart(9)} dòng  ${String(sizeKb).padStart(7)} KB`);
  }

  writeJson(path.join(outDir, "_manifest.json"), manifest);
  return manifest;
}

async function main() {
  heading("BƯỚC 2 — BACKUP CẢ HAI DATABASE");

  const { oldUrl, newUrl } = loadEnv();
  const oldDb = await connect(oldUrl, "DB CŨ  ");
  const newDb = await connect(newUrl, "DB MỚI ");

  const stamp = timestampSlug();
  const backupRoot = ensureDir(path.join(__dirname, "out", `backup_${stamp}`));

  try {
    const oldManifest = await dumpDatabase(oldDb, "DB CŨ", path.join(backupRoot, "old"));
    const newManifest = await dumpDatabase(newDb, "DB MỚI", path.join(backupRoot, "new"));

    const totalOld = Object.values(oldManifest.tables).reduce((a, b) => a + b, 0);
    const totalNew = Object.values(newManifest.tables).reduce((a, b) => a + b, 0);

    heading("HOÀN TẤT BACKUP");
    console.log(`  DB cũ  : ${fmtNumber(totalOld)} bản ghi`);
    console.log(`  DB mới : ${fmtNumber(totalNew)} bản ghi`);
    console.log(`\n  📦 Thư mục backup: ${backupRoot}`);
    console.log("     → Copy thư mục này sang ổ khác / cloud trước khi chạy bước 3.\n");
    console.log("  💡 Nên bật thêm Point-in-Time Recovery trên Supabase dashboard");
    console.log("     (Database → Backups) để có lớp bảo vệ thứ hai.\n");
  } finally {
    await oldDb.end();
    await newDb.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Lỗi:", err);
  process.exit(1);
});
