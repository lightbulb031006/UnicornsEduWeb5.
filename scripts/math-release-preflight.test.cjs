const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../apps/api/prisma/schema/migrations');
const names = fs.readdirSync(root).filter((name) =>
  fs.existsSync(path.join(root, name, 'migration.sql')),
);
const source = fs.readFileSync(path.join(__dirname, 'math-release-preflight.cjs'), 'utf8');
const oneTimeRepair = '20261004000000_one_time_course_setting';

async function runPreflight({ pending = [oneTimeRepair], impact = '0', legacyCollision = 0 } = {}) {
  const queries = [];
  const output = [];
  let ended = false;
  const context = {
    process: { env: { DIRECT_URL: 'postgresql://test:test@localhost/test' }, argv: [] },
    URL,
    console: { log: (value) => output.push(JSON.parse(value)) },
    require: (id) => {
      if (id === 'node:path') return path.posix;
      if (id === 'node:fs') return {
        readdirSync: () => names,
        existsSync: () => true,
        readFileSync: (file) => fs.readFileSync(file.replace('/app/prisma/schema/migrations', root), 'utf8'),
      };
      if (id === '/app/node_modules/pg') return { Client: class {
        async connect() {}
        async end() { ended = true; }
        async query(sql, params) {
          queries.push({ sql, params });
          if (sql === 'SHOW server_version_num') return { rows: [{ server_version_num: '170000' }] };
          if (sql.includes('SELECT migration_name')) return { rows: names.filter((name) => !pending.includes(name)).map((migration_name) => ({ migration_name, finished_at: new Date() })) };
          if (sql.includes("name IN ('THPTQG', 'PREVOI')")) return { rows: [{ count: impact }] };
          if (sql.includes('WHERE id = ANY($1::text[])')) return { rows: [{ count: legacyCollision }] };
          if (sql.includes('AS total_wallet_balance')) return { rows: [{ students: 35, users: 43, classes: 38, sessions: 551, attendance: 552, wallet_transactions: 222, total_wallet_balance: '-3778000', attendance_financial_digest: 'attendance', wallet_ledger_digest: 'wallet' }] };
          if (sql.includes('count(*)::int AS count')) return { rows: [{ count: 0 }] };
          return { rows: [] };
        }
      } };
      throw new Error(`Unexpected module: ${id}`);
    },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf('main().catch')) + 'globalThis.result = main();', context);
  let error;
  try { await context.result; } catch (caught) { error = caught; }
  assert.equal(ended, true);
  assert.equal(queries[0].sql, 'BEGIN READ ONLY');
  assert.ok(queries.every(({ sql }) => !/\b(UPDATE|INSERT|DELETE|ALTER|DROP)\b/i.test(sql)));
  return { queries, output, error };
}

test('stops pending Tin wallet backfill when any target course or ID exists on Math', async () => {
  const { error, queries, output } = await runPreflight({ impact: '1' });
  assert.match(error.message, /impact review required/);
  assert.equal(output.length, 0);
  assert.equal(queries.some(({ sql }) => sql === 'COMMIT'), false);
  const impact = queries.find(({ sql }) => sql.includes("name IN ('THPTQG', 'PREVOI')"));
  assert.deepEqual(Array.from(impact.params[0]).sort(), ['UNICL-c1f789b32e', 'UNICL-dc32916487']);
  assert.deepEqual(Array.from(impact.params[1]).sort(), ['UNIST-9b344d2867', 'UNIST-c17f8016fe']);
});

test('stops when only the earlier name-based one-time tuition backfill is pending', async () => {
  const { error } = await runPreflight({ pending: ['20261002100000_backfill_one_time_course_tuition'], impact: '1' });
  assert.match(error.message, /impact review required/);
});

test('allows rehearsal preparation when pending Tin targets are absent', async () => {
  const { error, output, queries } = await runPreflight();
  assert.equal(error, undefined);
  assert.equal(output[0].tinOneTimeCollisions, 0);
  assert.equal(output[0].pendingCount, 1);
  assert.equal(queries.at(-1).sql, 'COMMIT');
});

test('does not block already-applied one-time backfills', async () => {
  const { error, queries } = await runPreflight({ pending: [], impact: '1' });
  assert.equal(error, undefined);
  assert.equal(queries.some(({ sql }) => sql.includes("name IN ('THPTQG', 'PREVOI')")), false);
});

test('preserves the stop for pending legacy Tin student repairs', async () => {
  const { error } = await runPreflight({ pending: ['20260818120000_backfill_achievement_import_student_dates'], legacyCollision: 1 });
  assert.match(error.message, /Tin repair IDs exist/);
});
