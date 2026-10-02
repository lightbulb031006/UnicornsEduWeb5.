/**
 * Import student avatars from:
 *   …/ảnh học viên đại diện 2/{Họ tên}.jpg
 *
 * Creates a linked student User when missing (local import convenience).
 * Uploads clean original to `avatars` + watermarked twin to `avatars-public`.
 *
 * Usage (from apps/api, against local DB):
 *   unset DIRECT_URL
 *   pnpm dlx tsx scripts/import-student-avatars-from-folder.ts \
 *     --dir "/Users/sunny/Downloads/Học Tin cùng Chuyên Tin" --apply
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { UserRole, UserStatus } from '../generated/enums';
import {
  bakeDiagonalWatermark,
  buildAvatarWatermarkedPath,
} from '../src/storage/image-watermark';
import {
  AVATAR_PUBLIC_BUCKET,
  AVATAR_STORAGE_BUCKET,
} from '../src/storage/media-buckets';
import { uploadStorageObject } from '../src/storage/supabase-storage';

const databaseUrl =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL (or DIRECT_URL) is required.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

function parseArgs(argv: string[]) {
  let dir: string | null = null;
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') apply = true;
    if (arg === '--dir') {
      dir = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return { dir, apply };
}

/** Exact full-name key: NFC + collapse whitespace + vi lowercase. No diacritic fold. */
function exactNameKey(value: string) {
  return value
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi');
}

function mimeFromExt(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[parts.length - 1],
    lastName: parts.slice(0, -1).join(' '),
  };
}

async function findAvatarDir(root: string) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name.normalize('NFC').toLocaleLowerCase('vi');
    if (name.includes('ảnh học viên') || name.includes('anh hoc vien')) {
      return path.join(root, entry.name);
    }
  }
  throw new Error(`Không tìm thấy thư mục ảnh học viên đại diện trong ${root}`);
}

async function listAvatarFiles(avatarDir: string) {
  const entries = await fs.readdir(avatarDir, { withFileTypes: true });
  const rows: Array<{ name: string; filePath: string }> = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fileName = entry.name.normalize('NFC');
    if (fileName.startsWith('.')) continue;
    const rawExt = path.extname(fileName);
    const ext = rawExt.toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;
    // Keep original case for basename — path.basename is case-sensitive on ext.
    const name = path.basename(fileName, rawExt).trim();
    rows.push({ name, filePath: path.join(avatarDir, entry.name) });
  }
  return rows;
}

async function ensureStudentUser(student: {
  id: string;
  fullName: string;
  userId: string | null;
}) {
  if (student.userId) return student.userId;

  const userId = randomUUID();
  const handle = `import_${student.id.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  const email = `import+${student.id.toLowerCase()}@local.import.invalid`;
  const { firstName, lastName } = splitFullName(student.fullName);

  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: userId,
        email,
        accountHandle: handle,
        roleType: UserRole.student,
        status: UserStatus.active,
        emailVerified: false,
        first_name: firstName,
        last_name: lastName,
      },
    });
    await tx.studentInfo.update({
      where: { id: student.id },
      data: { userId },
    });
  });

  console.log(`Created linked user for ${student.fullName} → ${userId}`);
  return userId;
}

async function main() {
  const { dir, apply } = parseArgs(process.argv.slice(2));
  if (!dir) {
    throw new Error('Missing --dir "/path/to/Học Tin cùng Chuyên Tin"');
  }

  const avatarDir = await findAvatarDir(dir);
  const files = await listAvatarFiles(avatarDir);
  const students = await prisma.studentInfo.findMany({
    select: { id: true, fullName: true, userId: true },
  });

  // Exact match only (full name). No soft / diacritic-fold / partial name matching.
  const byExactName = new Map(
    students.map((s) => [exactNameKey(s.fullName), s] as const),
  );

  type Row = {
    fileName: string;
    filePath: string;
    status: 'matched' | 'unmatched';
    student: (typeof students)[number] | null;
  };

  const rows: Row[] = files.map((file) => {
    const student = byExactName.get(exactNameKey(file.name)) ?? null;
    return {
      fileName: path.basename(file.filePath),
      filePath: file.filePath,
      status: student ? 'matched' : 'unmatched',
      student,
    };
  });

  const matched = rows.filter((r) => r.status === 'matched');
  const unmatched = rows.filter((r) => r.status === 'unmatched');

  console.log('\n=== Avatar import report ===');
  console.log(`Target DB host: ${new URL(databaseUrl!).hostname}:${new URL(databaseUrl!).port || '(default)'}`);
  console.log(`Files: ${rows.length}`);
  console.log(`Matched: ${matched.length}`);
  console.log(`Unmatched: ${unmatched.length}`);
  if (unmatched.length) {
    console.log('-- Unmatched --');
    for (const row of unmatched) console.log(`  ${row.fileName}`);
  }
  console.log('-- Matched --');
  for (const row of matched) {
    console.log(
      `  ${row.student!.fullName} (${row.student!.id}) user=${row.student!.userId ?? 'WILL_CREATE'}`,
    );
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to upload.');
    return;
  }

  let uploaded = 0;
  let failed = 0;
  for (const row of matched) {
    try {
      const userId = await ensureStudentUser(row.student!);
      const buffer = await fs.readFile(row.filePath);
      const mimetype = mimeFromExt(row.filePath);
      const avatarPath = `users/${userId}/avatar`;
      const avatarWatermarkedPath = buildAvatarWatermarkedPath(userId);
      const watermarked = await bakeDiagonalWatermark(buffer);

      await uploadStorageObject({
        bucket: AVATAR_STORAGE_BUCKET,
        path: avatarPath,
        body: buffer,
        contentType: mimetype,
        upsert: true,
      });
      await uploadStorageObject({
        bucket: AVATAR_PUBLIC_BUCKET,
        path: avatarWatermarkedPath,
        body: watermarked.buffer,
        contentType: watermarked.contentType,
        upsert: true,
      });
      await prisma.user.update({
        where: { id: userId },
        data: { avatarPath, avatarWatermarkedPath },
      });
      uploaded += 1;
      console.log(`OK avatar ${row.student!.fullName}`);
    } catch (error) {
      failed += 1;
      console.error(
        `FAIL ${row.fileName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log('\n=== Apply result ===');
  console.log({ uploaded, failed, unmatched: unmatched.length });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
