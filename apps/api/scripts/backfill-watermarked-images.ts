/**
 * One-shot backfill: create watermarked public twins for existing avatars
 * and achievement proof images, then set watermarked path columns.
 *
 * Prerequisites:
 * - Migration `20260811120000_add_watermarked_image_paths` applied
 * - Public buckets `avatars-public` and `achievements-public` exist (public-read)
 * - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set
 *
 * Usage (from apps/api):
 *   pnpm dlx tsx scripts/backfill-watermarked-images.ts
 *
 * (Prefer `tsx` over `ts-node`: Prisma 7 generated client is ESM `.ts` and
 *  does not resolve under plain `ts-node` + CommonJS.)
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import {
  bakeDiagonalWatermark,
  buildAchievementWatermarkedPath,
  buildAvatarWatermarkedPath,
} from '../src/storage/image-watermark';
import {
  ACHIEVEMENT_PUBLIC_BUCKET,
  ACHIEVEMENT_STORAGE_BUCKET,
  AVATAR_PUBLIC_BUCKET,
  AVATAR_STORAGE_BUCKET,
} from '../src/storage/media-buckets';
import {
  getSupabaseAdminClient,
  uploadStorageObject,
} from '../src/storage/supabase-storage';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the watermark backfill.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function downloadObject(bucket: string, path: string): Promise<Buffer> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(error?.message || `Download failed: ${bucket}/${path}`);
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function backfillAvatars() {
  const users = await prisma.user.findMany({
    where: {
      avatarPath: { not: null },
      OR: [{ avatarWatermarkedPath: null }, { avatarWatermarkedPath: '' }],
    },
    select: { id: true, avatarPath: true },
  });

  let ok = 0;
  let failed = 0;
  for (const user of users) {
    if (!user.avatarPath) continue;
    const watermarkedPath = buildAvatarWatermarkedPath(user.id);
    try {
      const clean = await downloadObject(AVATAR_STORAGE_BUCKET, user.avatarPath);
      const stamped = await bakeDiagonalWatermark(clean);
      await uploadStorageObject({
        bucket: AVATAR_PUBLIC_BUCKET,
        path: watermarkedPath,
        body: stamped.buffer,
        contentType: stamped.contentType,
        upsert: true,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { avatarWatermarkedPath: watermarkedPath },
      });
      ok += 1;
      console.log(`[avatar] ok ${user.id}`);
    } catch (error) {
      failed += 1;
      console.error(`[avatar] fail ${user.id}`, error);
    }
  }
  return { total: users.length, ok, failed };
}

async function backfillAchievements(
  kind: 'staff' | 'student',
) {
  if (kind === 'staff') {
    const rows = await prisma.staffAchievement.findMany({
      where: {
        imagePath: { not: null },
        OR: [
          { imageWatermarkedPath: null },
          { imageWatermarkedPath: '' },
        ],
      },
      select: { id: true, staffId: true, imagePath: true },
    });
    let ok = 0;
    let failed = 0;
    for (const row of rows) {
      if (!row.imagePath) continue;
      const watermarkedPath = buildAchievementWatermarkedPath(
        'staff',
        row.staffId,
        row.id,
      );
      try {
        const clean = await downloadObject(
          ACHIEVEMENT_STORAGE_BUCKET,
          row.imagePath,
        );
        const stamped = await bakeDiagonalWatermark(clean);
        await uploadStorageObject({
          bucket: ACHIEVEMENT_PUBLIC_BUCKET,
          path: watermarkedPath,
          body: stamped.buffer,
          contentType: stamped.contentType,
          upsert: true,
        });
        await prisma.staffAchievement.update({
          where: { id: row.id },
          data: { imageWatermarkedPath: watermarkedPath },
        });
        ok += 1;
        console.log(`[staff-ach] ok ${row.id}`);
      } catch (error) {
        failed += 1;
        console.error(`[staff-ach] fail ${row.id}`, error);
      }
    }
    return { total: rows.length, ok, failed };
  }

  const rows = await prisma.studentAchievement.findMany({
    where: {
      imagePath: { not: null },
      OR: [{ imageWatermarkedPath: null }, { imageWatermarkedPath: '' }],
    },
    select: { id: true, studentId: true, imagePath: true },
  });
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.imagePath) continue;
    const watermarkedPath = buildAchievementWatermarkedPath(
      'student',
      row.studentId,
      row.id,
    );
    try {
      const clean = await downloadObject(
        ACHIEVEMENT_STORAGE_BUCKET,
        row.imagePath,
      );
      const stamped = await bakeDiagonalWatermark(clean);
      await uploadStorageObject({
        bucket: ACHIEVEMENT_PUBLIC_BUCKET,
        path: watermarkedPath,
        body: stamped.buffer,
        contentType: stamped.contentType,
        upsert: true,
      });
      await prisma.studentAchievement.update({
        where: { id: row.id },
        data: { imageWatermarkedPath: watermarkedPath },
      });
      ok += 1;
      console.log(`[student-ach] ok ${row.id}`);
    } catch (error) {
      failed += 1;
      console.error(`[student-ach] fail ${row.id}`, error);
    }
  }
  return { total: rows.length, ok, failed };
}

async function main() {
  console.log('Backfill watermarked public twins…');
  const avatars = await backfillAvatars();
  const staffAch = await backfillAchievements('staff');
  const studentAch = await backfillAchievements('student');
  console.log(
    JSON.stringify(
      { avatars, staffAchievements: staffAch, studentAchievements: studentAch },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
