/**
 * List classes that have no unique 30-minute standard block count
 * (no active class_schedule_entries, mixed durations, or duration not a
 * multiple of 30 minutes). Admin must fill per-block rates by hand.
 *
 * Usage (from apps/api):
 *   pnpm dlx tsx scripts/list-classes-missing-standard-blocks.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { standardBlockCountFromSlots } from '../src/common/block-pricing.util';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const classes = await prisma.class.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      scheduleEntries: {
        where: { effectiveTo: null },
        select: { from: true, to: true },
      },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });

  const missing = classes.filter(
    (item) => standardBlockCountFromSlots(item.scheduleEntries) == null,
  );

  for (const item of missing) {
    const reason =
      item.scheduleEntries.length === 0
        ? 'no_active_schedule'
        : 'mixed_or_invalid_slot_duration';
    console.log(
      [
        item.id,
        item.name,
        item.status,
        item.scheduleEntries.length,
        reason,
      ].join('\t'),
    );
  }

  console.error(`Missing standard block count: ${missing.length} class(es)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
