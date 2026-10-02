// Runs inside the API image without starting Nest or its scheduled jobs.
const { Client } = require('/app/node_modules/pg');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Database connection is missing');
  const url = new URL(connectionString);
  if (url.searchParams.get('pgbouncer') === 'true') {
    throw new Error('A direct database connection is required');
  }
  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '60s'");
    const version = await client.query('SHOW server_version_num');
    const migrations = await client.query(
      'SELECT migration_name, finished_at, rolled_back_at FROM public._prisma_migrations',
    );
    if (migrations.rows.some((row) => !row.finished_at && !row.rolled_back_at)) {
      throw new Error('An unfinished production migration requires investigation');
    }
    const applied = new Set(migrations.rows.filter((row) => row.finished_at).map((row) => row.migration_name));
    const root = '/app/prisma/schema/migrations';
    const pending = fs.readdirSync(root).filter((name) => fs.existsSync(path.join(root, name, 'migration.sql')) && !applied.has(name)).sort();
    const repairs = [
      '20260818120000_backfill_achievement_import_student_dates',
      '20260818140000_remove_hallucinated_achievement_students',
    ];
    const ids = [...new Set(repairs.flatMap((name) =>
      fs.readFileSync(path.join(root, name, 'migration.sql'), 'utf8').match(/UNIST-[a-z0-9]+/g) || [],
    ))];
    const collisions = await client.query('SELECT count(*)::int AS count FROM public.student_info WHERE id = ANY($1::text[])', [ids]);
    if (collisions.rows[0].count !== 0 && repairs.some((name) => pending.includes(name))) {
      throw new Error('Tin repair IDs exist in the Math database; rollout stopped');
    }
    const counts = await client.query(`SELECT
      (SELECT count(*)::int FROM public.student_info) AS students,
      (SELECT count(*)::int FROM public.users) AS users,
      (SELECT count(*)::int FROM public.classes) AS classes,
      (SELECT count(*)::int FROM public.sessions) AS sessions,
      (SELECT count(*)::int FROM public.attendance) AS attendance,
      (SELECT count(*)::int FROM public.wallet_transactions_history) AS wallet_transactions,
      (SELECT coalesce(sum(account_balance), 0)::text FROM public.student_info) AS total_wallet_balance,
      (SELECT md5(coalesce(json_agg(snapshot ORDER BY id)::text, '[]')) FROM
        (SELECT id, student_id, session_id, status, tuition_fee, transaction_id FROM public.attendance) snapshot) AS attendance_financial_digest,
      (SELECT md5(coalesce(json_agg(snapshot ORDER BY id)::text, '[]')) FROM
        (SELECT id, student_id, type, amount FROM public.wallet_transactions_history) snapshot) AS wallet_ledger_digest`);
    // These two committed migrations provision missing accounts/profiles. Predict
    // their exact additions from the untouched snapshot instead of bypassing checks.
    const eligibleAccounts = await client.query(`SELECT count(*)::int AS count
      FROM public.student_info s
      WHERE s.user_id IS NULL AND s.email IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.email = s.email)
        AND (SELECT count(*) FROM public.student_info s2
          WHERE s2.email = s.email AND s2.user_id IS NULL) = 1`);
    const eligibleProfiles = await client.query(`SELECT count(*)::int AS count
      FROM public.users u WHERE u.role_type = 'student'
        AND NOT EXISTS (SELECT 1 FROM public.student_info s WHERE s.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM public.student_info s
          WHERE s.user_id IS NULL AND s.email IS NOT NULL AND lower(s.email) = lower(u.email))`);
    const expectedCounts = { ...counts.rows[0] };
    if (pending.includes('20260822150000_backfill_student_user_accounts')) {
      expectedCounts.users += eligibleAccounts.rows[0].count;
    }
    if (pending.includes('20260904090000_backfill_student_info_for_student_users')) {
      expectedCounts.students += eligibleProfiles.rows[0].count;
    }
    await client.query('COMMIT');
    const summary = {
      postgresMajor: Math.floor(Number(version.rows[0].server_version_num) / 10000),
      pendingCount: pending.length,
      pending,
      tinRepairIdCount: ids.length,
      tinRepairCollisions: collisions.rows[0].count,
      counts: counts.rows[0],
      expectedCounts,
    };
    if (process.argv[2] === 'prepare') {
      const env = {
        PGHOST: url.hostname,
        PGPORT: url.port || '5432',
        PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGSSLMODE: url.searchParams.get('sslmode') || 'prefer',
        PGCONNECT_TIMEOUT: '20',
      };
      if (Object.values(env).some((value) => /[\r\n]/.test(value))) throw new Error('Unsupported multiline database credential');
      fs.writeFileSync('/preflight/pg.env', Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
      fs.writeFileSync('/preflight/before.json', JSON.stringify(summary, null, 2), { mode: 0o600 });
      fs.writeFileSync('/preflight/postgres-major', String(summary.postgresMajor), { mode: 0o600 });
    }
    console.log(JSON.stringify(summary));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // Driver errors can contain connection details; only emit their safe code.
  console.error(error instanceof Error && !error.code ? error.message : `Database preflight failed (${error.code || 'unknown'})`);
  process.exitCode = 1;
});
