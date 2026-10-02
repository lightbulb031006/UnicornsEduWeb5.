/**
 * Read-only audit: list sessions missing startTime and/or endTime.
 *
 * Usage (from apps/api):
 *   pnpm sessions:list-missing-time
 *
 * Does not modify data. DATABASE_URL (or DIRECT_URL) must be set.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import {
  formatMissingSessionLine,
  MISSING_SESSION_TIME_WHERE,
} from '../src/session/session-missing-time.util';

const databaseUrl =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL or DIRECT_URL is required to list sessions missing time.',
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const rows = await prisma.session.findMany({
    where: MISSING_SESSION_TIME_WHERE,
    select: {
      id: true,
      date: true,
      class: {
        select: { name: true },
      },
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  console.log(
    `Tìm thấy ${rows.length} buổi thiếu giờ bắt đầu hoặc giờ kết thúc.`,
  );
  for (const row of rows) {
    console.log(formatMissingSessionLine(row));
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
