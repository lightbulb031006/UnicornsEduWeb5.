/**
 * Backfill watermarked public twins for landing images: user avatars,
 * staff/student achievement proof images and student gallery photos.
 *
 * Default mode only fills rows missing a twin. `--regenerate` re-bakes every
 * row that has a clean original (use after replacing
 * `src/storage/assets/watermark-logo.webp`). Regenerate reuses the stored
 * watermarked path, so public URLs already saved by the CMS stay valid.
 *
 * Prerequisites:
 * - Migrations `20260811120000_add_watermarked_image_paths` and
 *   `20260811140000_add_student_gallery_items` applied
 * - Public buckets `avatars-public`, `achievements-public`,
 *   `student-gallery-public` exist (public-read)
 * - DATABASE_URL + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set
 *
 * Usage (from apps/api):
 *   pnpm dlx tsx scripts/backfill-watermarked-images.ts [--regenerate] [--only=avatars,staff,student,gallery] [--allow-remote]
 *
 * Without `--allow-remote` the script refuses to run when DATABASE_URL or
 * SUPABASE_URL is not a local host (guard against hitting production).
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
  buildStudentGalleryWatermarkedPath,
} from '../src/storage/image-watermark';
import {
  ACHIEVEMENT_PUBLIC_BUCKET,
  ACHIEVEMENT_STORAGE_BUCKET,
  AVATAR_PUBLIC_BUCKET,
  AVATAR_STORAGE_BUCKET,
  STUDENT_GALLERY_PUBLIC_BUCKET,
  STUDENT_GALLERY_STORAGE_BUCKET,
} from '../src/storage/media-buckets';
import {
  getSupabaseAdminClient,
  uploadStorageObject,
} from '../src/storage/supabase-storage';

type TargetKey = 'avatars' | 'staff' | 'student' | 'gallery';

interface TwinRow {
  id: string;
  cleanPath: string;
  /** Watermarked path currently stored in DB (may be null/''). */
  storedPath: string | null;
  /** Path to (over)write: stored path if any, else canonical builder path. */
  targetPath: string;
}

interface Target {
  key: TargetKey;
  cleanBucket: string;
  publicBucket: string;
  load: (regenerate: boolean) => Promise<TwinRow[]>;
  save: (id: string, watermarkedPath: string) => Promise<unknown>;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

function parseArgs(argv: string[]) {
  const regenerate = argv.includes('--regenerate');
  const allowRemote = argv.includes('--allow-remote');
  const onlyArg = argv.find((arg) => arg.startsWith('--only='));
  const only = onlyArg
    ? new Set(onlyArg.slice('--only='.length).split(',').map((s) => s.trim()))
    : null;
  return { regenerate, allowRemote, only };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const args = parseArgs(process.argv.slice(2));

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the watermark backfill.');
}
const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? '';
const dbHost = hostOf(databaseUrl);
const storageHost = hostOf(supabaseUrl);
const isLocal = LOCAL_HOSTS.has(dbHost) && LOCAL_HOSTS.has(storageHost);
if (!isLocal && !args.allowRemote) {
  throw new Error(
    `Refusing to run against non-local target (db=${dbHost}, storage=${storageHost}). Pass --allow-remote to confirm.`,
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

/** Missing twin = NULL or ''. Regenerate = any row with a clean original. */
function twinFilter(regenerate: boolean, column: string) {
  return regenerate ? {} : { OR: [{ [column]: null }, { [column]: '' }] };
}

const targets: Target[] = [
  {
    key: 'avatars',
    cleanBucket: AVATAR_STORAGE_BUCKET,
    publicBucket: AVATAR_PUBLIC_BUCKET,
    load: async (regenerate) =>
      (
        await prisma.user.findMany({
          where: {
            avatarPath: { not: null },
            ...twinFilter(regenerate, 'avatarWatermarkedPath'),
          },
          select: { id: true, avatarPath: true, avatarWatermarkedPath: true },
        })
      ).map((r) => ({
        id: r.id,
        cleanPath: r.avatarPath ?? '',
        storedPath: r.avatarWatermarkedPath,
        targetPath: r.avatarWatermarkedPath || buildAvatarWatermarkedPath(r.id),
      })),
    save: (id, path) =>
      prisma.user.update({
        where: { id },
        data: { avatarWatermarkedPath: path },
      }),
  },
  {
    key: 'staff',
    cleanBucket: ACHIEVEMENT_STORAGE_BUCKET,
    publicBucket: ACHIEVEMENT_PUBLIC_BUCKET,
    load: async (regenerate) =>
      (
        await prisma.staffAchievement.findMany({
          where: {
            imagePath: { not: null },
            ...twinFilter(regenerate, 'imageWatermarkedPath'),
          },
          select: {
            id: true,
            staffId: true,
            imagePath: true,
            imageWatermarkedPath: true,
          },
        })
      ).map((r) => ({
        id: r.id,
        cleanPath: r.imagePath ?? '',
        storedPath: r.imageWatermarkedPath,
        targetPath: r.imageWatermarkedPath || buildAchievementWatermarkedPath('staff', r.staffId, r.id),
      })),
    save: (id, path) =>
      prisma.staffAchievement.update({
        where: { id },
        data: { imageWatermarkedPath: path },
      }),
  },
  {
    key: 'student',
    cleanBucket: ACHIEVEMENT_STORAGE_BUCKET,
    publicBucket: ACHIEVEMENT_PUBLIC_BUCKET,
    load: async (regenerate) =>
      (
        await prisma.studentAchievement.findMany({
          where: {
            imagePath: { not: null },
            ...twinFilter(regenerate, 'imageWatermarkedPath'),
          },
          select: {
            id: true,
            studentId: true,
            imagePath: true,
            imageWatermarkedPath: true,
          },
        })
      ).map((r) => ({
        id: r.id,
        cleanPath: r.imagePath ?? '',
        storedPath: r.imageWatermarkedPath,
        targetPath: r.imageWatermarkedPath || buildAchievementWatermarkedPath('student', r.studentId, r.id),
      })),
    save: (id, path) =>
      prisma.studentAchievement.update({
        where: { id },
        data: { imageWatermarkedPath: path },
      }),
  },
  {
    key: 'gallery',
    cleanBucket: STUDENT_GALLERY_STORAGE_BUCKET,
    publicBucket: STUDENT_GALLERY_PUBLIC_BUCKET,
    load: async (regenerate) =>
      (
        await prisma.studentGalleryItem.findMany({
          where: {
            imagePath: { not: null },
            ...twinFilter(regenerate, 'imageWatermarkedPath'),
          },
          select: {
            id: true,
            studentId: true,
            imagePath: true,
            imageWatermarkedPath: true,
          },
        })
      ).map((r) => ({
        id: r.id,
        cleanPath: r.imagePath ?? '',
        storedPath: r.imageWatermarkedPath,
        targetPath: r.imageWatermarkedPath || buildStudentGalleryWatermarkedPath(r.studentId, r.id),
      })),
    save: (id, path) =>
      prisma.studentGalleryItem.update({
        where: { id },
        data: { imageWatermarkedPath: path },
      }),
  },
];

async function downloadObject(bucket: string, path: string): Promise<Buffer> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(error?.message || `Download failed: ${bucket}/${path}`);
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function runTarget(target: Target, regenerate: boolean) {
  const rows = (await target.load(regenerate)).filter((r) => r.cleanPath);
  let ok = 0;
  const failed: string[] = [];
  for (const row of rows) {
    const watermarkedPath = row.targetPath;
    try {
      const clean = await downloadObject(target.cleanBucket, row.cleanPath);
      const stamped = await bakeDiagonalWatermark(clean);
      await uploadStorageObject({
        bucket: target.publicBucket,
        path: watermarkedPath,
        body: stamped.buffer,
        contentType: stamped.contentType,
        upsert: true,
      });
      if (row.storedPath !== watermarkedPath) {
        await target.save(row.id, watermarkedPath);
      }
      ok += 1;
      console.log(`[${target.key}] ok ${row.id}`);
    } catch (error) {
      failed.push(row.id);
      console.error(`[${target.key}] fail ${row.id}`, error);
    }
  }
  return { total: rows.length, ok, failed: failed.length, failedIds: failed };
}

async function main() {
  console.log(
    `Backfill watermarked public twins (mode=${args.regenerate ? 'regenerate' : 'missing-only'}, db=${dbHost}, storage=${storageHost})…`,
  );
  const summary: Record<string, unknown> = {};
  for (const target of targets) {
    if (args.only && !args.only.has(target.key)) continue;
    summary[target.key] = await runTarget(target, args.regenerate);
  }
  console.log(JSON.stringify(summary, null, 2));
  const anyFailed = Object.values(summary).some(
    (s) => (s as { failed: number }).failed > 0,
  );
  if (anyFailed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
