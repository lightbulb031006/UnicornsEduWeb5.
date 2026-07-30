/**
 * Thư viện dùng chung cho bộ script đồng bộ DB cũ -> DB mới.
 *
 * Nguyên tắc an toàn:
 *  - Mọi giá trị lấy từ Postgres đều giữ NGUYÊN DẠNG TEXT (raw string) để tránh
 *    JS Date/JSON parse làm lệch ngày, lệch timezone hoặc hỏng cột jsonb.
 *  - Không có script nào trong bộ này UPDATE hay DELETE dữ liệu nghiệp vụ,
 *    trừ 04-rollback.mjs (chỉ xoá đúng các id vừa chèn).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Nạp `pg` — thử lần lượt các nơi đã cài sẵn để không phải npm install lại
// ---------------------------------------------------------------------------

function loadPg() {
  const candidates = [
    __dirname,
    path.join(SCRIPTS_DIR, "migrate-tmp"),
    path.resolve(SCRIPTS_DIR, ".."), // apps/api
    path.resolve(SCRIPTS_DIR, "..", "..", ".."), // repo root
  ];

  const errors = [];
  for (const base of candidates) {
    try {
      const require = createRequire(pathToFileURL(path.join(base, "__resolve.cjs")));
      return require("pg");
    } catch (err) {
      errors.push(`${base}: ${err.code || err.message}`);
    }
  }

  console.error(
    "\n❌ Không tìm thấy package `pg`. Chạy lệnh sau rồi thử lại:\n" +
      `   cd "${__dirname}" && npm install\n\n` +
      "Chi tiết:\n  " +
      errors.join("\n  ")
  );
  process.exit(1);
}

export const pg = loadPg();

// ---------------------------------------------------------------------------
// Ép mọi kiểu "dễ sai" về text — CỰC KỲ QUAN TRỌNG
// ---------------------------------------------------------------------------
// date/timestamp: nếu để pg parse thành JS Date rồi ghi lại, ngày có thể lệch
//   1 ngày do timezone máy chạy script.
// json/jsonb: nếu để pg parse thành object/array, khi ghi lại node-postgres sẽ
//   serialize array thành cú pháp mảng Postgres `{...}` -> hỏng cột jsonb
//   (ví dụ `classes.schedule`).
// Giữ raw text thì Postgres tự parse lại đúng y nguyên bản gốc.

const RAW_TYPE_OIDS = [
  1082, // date
  1083, // time
  1114, // timestamp
  1184, // timestamptz
  1266, // timetz
  1186, // interval
  114, // json
  3802, // jsonb
  1700, // numeric
  20, // int8
];

for (const oid of RAW_TYPE_OIDS) {
  pg.types.setTypeParser(oid, (value) => value);
}

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

export function loadEnv() {
  const envPath = path.join(SCRIPTS_DIR, ".env.migration");
  if (!fs.existsSync(envPath)) {
    console.error(`❌ Không thấy file ${envPath}`);
    process.exit(1);
  }

  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  const oldUrl = env.OLD_DATABASE_URL;
  const newUrl = env.NEW_DATABASE_URL;

  if (!oldUrl || !newUrl) {
    console.error("❌ Thiếu OLD_DATABASE_URL hoặc NEW_DATABASE_URL trong .env.migration");
    process.exit(1);
  }
  if (oldUrl === newUrl) {
    console.error("❌ OLD_DATABASE_URL và NEW_DATABASE_URL giống hệt nhau. Dừng lại.");
    process.exit(1);
  }

  return { oldUrl, newUrl };
}

/** Che connection string khi in ra log. */
export function maskUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username}:***@${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
  } catch {
    return "<không parse được>";
  }
}

export async function connect(url, label) {
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    // Thời gian chờ rộng rãi vì Supabase pooler đôi khi phản hồi chậm
    connectionTimeoutMillis: 30_000,
    statement_timeout: 0,
  });
  await client.connect();
  const info = await client.query(
    "SELECT current_database() AS db, version() AS version"
  );
  console.log(`  ✅ ${label}: ${info.rows[0].db}  (${maskUrl(url)})`);
  return client;
}

// ---------------------------------------------------------------------------
// Metadata schema
// ---------------------------------------------------------------------------

/** Danh sách bảng thật trong schema public (bỏ view, bỏ bảng hệ thống). */
export async function listTables(client) {
  const { rows } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return rows.map((r) => r.table_name);
}

/** Map: table -> [{ name, dataType, isNullable, hasDefault }] */
export async function listColumns(client) {
  const { rows } = await client.query(`
    SELECT table_name, column_name, data_type, udt_name,
           is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.table_name)) map.set(row.table_name, []);
    map.get(row.table_name).push({
      name: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
      isNullable: row.is_nullable === "YES",
      hasDefault: row.column_default !== null,
      // Cột bắt buộc mà không có default -> nếu DB cũ thiếu cột này thì insert sẽ fail
      isRequired: row.is_nullable === "NO" && row.column_default === null,
    });
  }
  return map;
}

/** Map: table -> [cột khoá chính] */
export async function listPrimaryKeys(client) {
  const { rows } = await client.query(`
    SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `);

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.table_name)) map.set(row.table_name, []);
    map.get(row.table_name).push(row.column_name);
  }
  return map;
}

/** Cạnh khoá ngoại: [{ child, parent }] (bỏ self-reference). */
export async function listForeignKeys(client) {
  const { rows } = await client.query(`
    SELECT
      con.conrelid::regclass::text AS child,
      con.confrelid::regclass::text AS parent
    FROM pg_constraint con
    JOIN pg_namespace nsp ON nsp.oid = con.connamespace
    WHERE con.contype = 'f' AND nsp.nspname = 'public'
  `);

  return rows
    .map((r) => ({
      child: r.child.replace(/^public\./, "").replace(/"/g, ""),
      parent: r.parent.replace(/^public\./, "").replace(/"/g, ""),
    }))
    .filter((e) => e.child !== e.parent);
}

/** Map: tên enum type -> danh sách giá trị. */
export async function listEnums(client) {
  const { rows } = await client.query(`
    SELECT t.typname AS enum_name, e.enumlabel AS value
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
  `);

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.enum_name)) map.set(row.enum_name, []);
    map.get(row.enum_name).push(row.value);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Sắp xếp bảng theo thứ tự phụ thuộc khoá ngoại (cha trước, con sau)
// ---------------------------------------------------------------------------

export function topoSortTables(tables, fkEdges) {
  const tableSet = new Set(tables);
  const indegree = new Map(tables.map((t) => [t, 0]));
  const children = new Map(tables.map((t) => [t, []]));

  const seen = new Set();
  for (const { child, parent } of fkEdges) {
    // Bỏ self-reference (vd. staff_info.customer_care_managed_by_staff_id):
    // nó không tạo ràng buộc thứ tự GIỮA các bảng, nếu tính vào sẽ khiến
    // bảng đó không bao giờ đạt indegree 0 và kéo sập toàn bộ thứ tự.
    if (child === parent) continue;
    if (!tableSet.has(child) || !tableSet.has(parent)) continue;

    const key = `${parent}->${child}`;
    if (seen.has(key)) continue; // nhiều FK giữa cùng cặp bảng chỉ tính 1 cạnh
    seen.add(key);
    children.get(parent).push(child);
    indegree.set(child, indegree.get(child) + 1);
  }

  // Sắp xếp tên để kết quả ổn định giữa các lần chạy
  const queue = tables.filter((t) => indegree.get(t) === 0).sort();
  const ordered = [];
  const placed = new Set();

  while (queue.length) {
    const table = queue.shift();
    ordered.push(table);
    placed.add(table);
    for (const child of [...children.get(table)].sort()) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) {
        queue.push(child);
        queue.sort();
      }
    }
  }

  // Bảng còn lại nằm trong vòng lặp FK thật sự. Không có thứ tự hoàn hảo,
  // nên chọn dần bảng còn ít phụ thuộc chưa thoả nhất — giảm tối đa số lần
  // phải thử lại ở bước backfill.
  const cyclic = tables.filter((t) => !placed.has(t));
  const remaining = new Set(cyclic);

  while (remaining.size) {
    let best = null;
    let bestScore = Infinity;
    for (const table of [...remaining].sort()) {
      const score = indegree.get(table);
      if (score < bestScore) {
        best = table;
        bestScore = score;
      }
    }
    remaining.delete(best);
    ordered.push(best);
    for (const child of children.get(best)) {
      if (remaining.has(child)) indegree.set(child, indegree.get(child) - 1);
    }
  }

  return { ordered, cyclic };
}

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** Khoá so sánh cho khoá chính nhiều cột. */
export function pkKey(row, pkColumns) {
  return pkColumns.map((c) => String(row[c])).join("\u0000");
}

export function fmtNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function heading(title) {
  console.log(`\n${"═".repeat(72)}\n  ${title}\n${"═".repeat(72)}`);
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function timestampSlug() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
}

export function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  return filePath;
}
