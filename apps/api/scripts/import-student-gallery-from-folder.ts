/**
 * Import student gallery ("nhận xét") photos from a flat folder:
 *   {Name - 2kXX - School}.jpg
 *   {Name - 2kXX - School} (2).jpg   ← multiple photos per student allowed
 *
 * Prerequisites:
 * - Migration `20260811140000_add_student_gallery_items` applied
 * - DATABASE_URL (+ Supabase service role for --apply image upload)
 *
 * Usage (from apps/api):
 *   pnpm dlx tsx scripts/import-student-gallery-from-folder.ts \
 *     --dir "/Users/sunny/Downloads/FEEDBACK 2"
 *
 * Dry-run is default. Pass --apply to insert rows + upload images.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import {
  bakeDiagonalWatermark,
  buildStudentGalleryWatermarkedPath,
} from '../src/storage/image-watermark';
import {
  STUDENT_GALLERY_PUBLIC_BUCKET,
  STUDENT_GALLERY_STORAGE_BUCKET,
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

type ParsedFile = {
  studentName: string;
  cohortTag: string | null;
  birthYear: number | null;
  schoolHint: string | null;
  filePath: string;
  fileName: string;
};

type MatchStatus = 'matched' | 'ambiguous' | 'unmatched';

type MatchResult = ParsedFile & {
  status: MatchStatus;
  studentId: string | null;
  candidates: Array<{ id: string; fullName: string; school: string | null }>;
};

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

function normalizeName(value: string) {
  return value
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi');
}

/** Strip Vietnamese diacritics for fuzzy matching. */
function foldName(value: string) {
  return normalizeName(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd');
}

function cohortToBirthYear(tag: string | null): number | null {
  if (!tag) return null;
  const match = tag.match(/^2k(\d{1,2})$/i);
  if (!match) return null;
  const yy = Number(match[1]);
  if (!Number.isFinite(yy)) return null;
  return 2000 + yy;
}

function mimeFromExt(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function extensionForMime(mimetype: string) {
  if (mimetype === 'image/png') return 'png';
  if (mimetype === 'image/webp') return 'webp';
  return 'jpg';
}

async function listFiles(dir: string): Promise<ParsedFile[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const rows: ParsedFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fileName = entry.name.normalize('NFC');
    if (fileName.startsWith('.')) continue;
    const ext = path.extname(fileName).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;

    const base = path.basename(fileName, path.extname(fileName));
    // Drop trailing duplicate-index suffix like " (1)" / " (2)" before parsing.
    const withoutIndex = base.replace(/\s*\(\d+\)\s*$/, '').trim();
    const parts = withoutIndex.split(' - ').map((part) => part.trim());
    const studentName = parts[0] ?? withoutIndex;
    const cohortTag = parts.find((part) => /^2k\d{1,2}$/i.test(part)) ?? null;
    const birthYear = cohortToBirthYear(cohortTag);
    const schoolHint = parts.length >= 3 ? parts.slice(2).join(' - ') : (parts[1] && !cohortTag ? parts[1] : null);

    rows.push({
      studentName,
      cohortTag,
      birthYear,
      schoolHint: schoolHint && schoolHint !== '_' ? schoolHint : null,
      filePath: path.join(dir, entry.name),
      fileName,
    });
  }

  return rows;
}

async function matchStudents(rows: ParsedFile[]): Promise<MatchResult[]> {
  const students = await prisma.studentInfo.findMany({
    select: { id: true, fullName: true, school: true, birthYear: true },
  });

  const byName = new Map<string, typeof students>();
  for (const student of students) {
    const key = normalizeName(student.fullName);
    const list = byName.get(key) ?? [];
    list.push(student);
    byName.set(key, list);
  }

  return rows.map((row) => {
    const key = normalizeName(row.studentName);
    let candidates = byName.get(key) ?? [];

    if (candidates.length > 1 && row.birthYear != null) {
      const byBirth = candidates.filter(
        (candidate) => candidate.birthYear === row.birthYear,
      );
      if (byBirth.length > 0) candidates = byBirth;
    }

    if (candidates.length > 1 && row.schoolHint) {
      const schoolKey = foldName(row.schoolHint);
      const bySchool = candidates.filter((candidate) => {
        const school = foldName(candidate.school ?? '');
        return school.includes(schoolKey) || schoolKey.includes(school);
      });
      if (bySchool.length > 0) candidates = bySchool;
    }

    if (candidates.length === 1) {
      return {
        ...row,
        status: 'matched' as const,
        studentId: candidates[0].id,
        candidates: candidates.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          school: c.school,
        })),
      };
    }

    return {
      ...row,
      status: (candidates.length === 0 ? 'unmatched' : 'ambiguous') as MatchStatus,
      studentId: null,
      candidates: candidates.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        school: c.school,
      })),
    };
  });
}

async function applyImports(matches: MatchResult[]) {
  let created = 0;
  let skipped = 0;
  let failed = 0;

  // Group by student so sortOrder increments per-student in stable (file-list) order.
  const byStudent = new Map<string, MatchResult[]>();
  for (const row of matches) {
    if (row.status !== 'matched' || !row.studentId) {
      skipped += 1;
      continue;
    }
    const list = byStudent.get(row.studentId) ?? [];
    list.push(row);
    byStudent.set(row.studentId, list);
  }

  for (const [studentId, rows] of byStudent) {
    const last = await prisma.studentGalleryItem.findFirst({
      where: { studentId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    let nextSortOrder = (last?.sortOrder ?? -1) + 1;

    for (const row of rows) {
      const itemId = randomUUID();
      try {
        const buffer = await fs.readFile(row.filePath);
        const mimetype = mimeFromExt(row.filePath);
        const imagePath = `student/${studentId}/${itemId}.${extensionForMime(mimetype)}`;
        const imageWatermarkedPath = buildStudentGalleryWatermarkedPath(
          studentId,
          itemId,
        );
        const watermarked = await bakeDiagonalWatermark(buffer);

        await uploadStorageObject({
          bucket: STUDENT_GALLERY_STORAGE_BUCKET,
          path: imagePath,
          body: buffer,
          contentType: mimetype,
          upsert: true,
        });
        await uploadStorageObject({
          bucket: STUDENT_GALLERY_PUBLIC_BUCKET,
          path: imageWatermarkedPath,
          body: watermarked.buffer,
          contentType: watermarked.contentType,
          upsert: true,
        });

        await prisma.studentGalleryItem.create({
          data: {
            id: itemId,
            studentId,
            caption: null,
            imagePath,
            imageWatermarkedPath,
            sortOrder: nextSortOrder,
          },
        });
        nextSortOrder += 1;
        created += 1;
        console.log(`OK ${row.studentName} | ${row.fileName} → ${studentId}`);
      } catch (error) {
        failed += 1;
        console.error(
          `FAIL ${row.studentName} | ${row.fileName}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return { created, skipped, failed };
}

function printReport(matches: MatchResult[]) {
  const matched = matches.filter((row) => row.status === 'matched');
  const ambiguous = matches.filter((row) => row.status === 'ambiguous');
  const unmatched = matches.filter((row) => row.status === 'unmatched');

  console.log('\n=== Dry-run match report ===');
  console.log(`Total files: ${matches.length}`);
  console.log(`Matched:     ${matched.length}`);
  console.log(`Ambiguous:   ${ambiguous.length}`);
  console.log(`Unmatched:   ${unmatched.length}`);

  if (ambiguous.length > 0) {
    console.log('\n-- Ambiguous --');
    for (const row of ambiguous) {
      console.log(
        `${row.fileName} → candidates: ${row.candidates
          .map((c) => `${c.id} (${c.fullName} / ${c.school ?? '—'})`)
          .join('; ')}`,
      );
    }
  }

  if (unmatched.length > 0) {
    console.log('\n-- Unmatched --');
    for (const row of unmatched) {
      console.log(`${row.fileName} (name parsed: "${row.studentName}")`);
    }
  }

  console.log('\n-- Matched --');
  for (const row of matched) {
    console.log(`${row.studentId} | ${row.studentName} | ${row.fileName}`);
  }
}

async function main() {
  const { dir, apply } = parseArgs(process.argv.slice(2));
  if (!dir) {
    throw new Error('Missing --dir "/path/to/FEEDBACK 2"');
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? '(unset)';
  console.log(
    `Target DB host: ${new URL(databaseUrl!).hostname}:${new URL(databaseUrl!).port || '(default)'}`,
  );
  console.log(`SUPABASE_URL: ${supabaseUrl}`);

  const rows = await listFiles(dir);
  const matches = await matchStudents(rows);
  printReport(matches);

  if (!apply) {
    console.log(
      '\nDry-run only. Re-run with --apply after reviewing matches to insert into DB + upload images.',
    );
    return;
  }

  const result = await applyImports(matches);
  console.log('\n=== Apply result ===');
  console.log(result);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
