/**
 * Import student achievements from the marketing folder tree:
 *   …/THÀNH TÍCH/Năm học YYYY-YYYY/{Name - 2kXX - School}/{Award - Exam}.jpg
 *
 * Prerequisites:
 * - Migration `20260811160000_student_achievement_structured_fields` applied
 * - DATABASE_URL (+ Supabase service role for --apply image upload)
 *
 * Usage (from apps/api):
 *   pnpm dlx tsx scripts/import-student-achievements-from-folder.ts \
 *     --dir "/Users/sunny/Downloads/Học Tin cùng Chuyên Tin"
 *
 * Dry-run is default. Pass --apply to insert rows + upload proof images.
 */
import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { AchievementLevel } from '../generated/enums';
import {
  bakeDiagonalWatermark,
  buildAchievementWatermarkedPath,
} from '../src/storage/image-watermark';
import {
  ACHIEVEMENT_PUBLIC_BUCKET,
  ACHIEVEMENT_STORAGE_BUCKET,
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
  studentFolder: string;
  studentName: string;
  cohortTag: string | null;
  birthYear: number | null;
  schoolHint: string | null;
  academicYear: number;
  award: string;
  exam: string;
  level: AchievementLevel;
  courseLabel: string | null;
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
  let reupload = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') apply = true;
    if (arg === '--reupload') reupload = true;
    if (arg === '--dir') {
      dir = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return { dir, apply, reupload };
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

function inferLevel(exam: string, award: string): AchievementLevel {
  const text = `${award} ${exam}`.toLocaleLowerCase('vi');
  if (
    /hsgqg|quốc gia|quoc gia|đội tuyển hsgqg|doi tuyen hsgqg/.test(text)
  ) {
    return AchievementLevel.HSG_QUOC_GIA;
  }
  if (/quốc tế|quoc te|ioi|apio|icho/.test(text)) {
    return AchievementLevel.HSG_QUOC_GIA;
  }
  if (/đỗ chuyên|do chuyen|đỗ vào|do vao/.test(text)) {
    return AchievementLevel.DO_CHUYEN_TIN;
  }
  if (/cấp xã|cap xa|xã\b|xa\b|cấp trường|liên trường|phường\s|cấp phường|hsg cấp/.test(text)) {
    return AchievementLevel.KHAC;
  }
  if (/dh&đb|dh&db|duyên hải|bắc bộ|bac bo/.test(text)) {
    return AchievementLevel.DUYEN_HAI;
  }
  if (/trại hè hùng vương|hùng vương/.test(text)) {
    return AchievementLevel.TRAI_HE_HUNG_VUONG;
  }
  if (/tin học trẻ|tin hoc tre|vòng loại.*tin học trẻ|hạng \d+.*khu vực|khu vực miền/.test(text)) {
    return AchievementLevel.TIN_HOC_TRE;
  }
  return AchievementLevel.HSG_TINH_THANH_PHO;
}

function inferCourseLabel(
  schoolHint: string | null,
  birthYear: number | null,
): string | null {
  const school = (schoolHint ?? '').toLocaleLowerCase('vi');
  if (/thpt|chuyên|chuyen/.test(school)) return 'KHỐI THPT';
  if (/thcs|th&thcs|th & thcs/.test(school)) return 'KHỐI THCS';
  if (/tiểu học|tieu hoc/.test(school)) return 'KHỐI TH';
  if (birthYear != null) {
    if (birthYear <= 2010) return 'KHỐI THPT';
    if (birthYear <= 2014) return 'KHỐI THCS';
  }
  return null;
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

async function findThanhTichRoot(root: string) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name.normalize('NFC');
    if (name.includes('THÀNH TÍCH') || name.toUpperCase().includes('THANH TICH')) {
      return path.join(root, entry.name);
    }
  }
  throw new Error(`Không tìm thấy thư mục THÀNH TÍCH trong ${root}`);
}

async function walkAchievements(root: string): Promise<ParsedFile[]> {
  const thanhTich = await findThanhTichRoot(root);
  const yearDirs = await fs.readdir(thanhTich, { withFileTypes: true });
  const rows: ParsedFile[] = [];

  for (const yearDir of yearDirs) {
    if (!yearDir.isDirectory()) continue;
    const yearName = yearDir.name.normalize('NFC');
    const yearMatch = yearName.match(/(\d{4})\s*[-–]\s*(\d{4})/);
    const academicYear = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
    const yearPath = path.join(thanhTich, yearDir.name);
    const studentDirs = await fs.readdir(yearPath, { withFileTypes: true });

    for (const studentDir of studentDirs) {
      if (!studentDir.isDirectory()) continue;
      const folder = studentDir.name.normalize('NFC');
      const parts = folder.split(' - ').map((part) => part.trim());
      const studentName = parts[0] ?? folder;
      const cohortTag =
        parts.find((part) => /^2k\d{1,2}$/i.test(part)) ?? null;
      const birthYear = cohortToBirthYear(cohortTag);
      const schoolHint =
        parts.length >= 3
          ? parts.slice(cohortTag && parts[1] === cohortTag ? 2 : 1).join(' - ')
          : parts[2] ?? parts[1] ?? null;

      const studentPath = path.join(yearPath, studentDir.name);
      const files = await fs.readdir(studentPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile()) continue;
        const fileName = file.name.normalize('NFC');
        if (fileName.startsWith('.')) continue;
        const ext = path.extname(fileName).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;

        const base = path.basename(fileName, ext).replace(/\.(jpg|jpeg|png|webp)$/i, '');
        // Skip generic numbered dumps like "1.jpg" without award/exam.
        if (/^\d+$/.test(base)) continue;

        const splitMatch = base.match(/\s[-–—]\s/);
        const splitIdx = splitMatch?.index ?? -1;
        const sepLen = splitMatch?.[0]?.length ?? 3;
        const award = (
          splitIdx >= 0 ? base.slice(0, splitIdx) : base
        ).trim();
        const exam = (
          splitIdx >= 0 ? base.slice(splitIdx + sepLen) : '(chưa phân loại)'
        )
          .replace(/\s*\(\d+\)\s*$/, '')
          .trim();

        rows.push({
          studentFolder: folder,
          studentName,
          cohortTag,
          birthYear,
          schoolHint,
          academicYear,
          award,
          exam,
          level: inferLevel(award, exam),
          courseLabel: inferCourseLabel(schoolHint, birthYear),
          filePath: path.join(studentPath, file.name),
          fileName,
        });
      }
    }
  }

  return rows;
}

async function matchStudents(rows: ParsedFile[]): Promise<MatchResult[]> {
  const students = await prisma.studentInfo.findMany({
    select: { id: true, fullName: true, school: true, birthYear: true },
  });

  // Exact full-name match only (NFC + whitespace + vi lowercase). No diacritic fold / soft match.
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

async function applyImports(matches: MatchResult[], reupload: boolean) {
  let created = 0;
  let reuploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of matches) {
    if (row.status !== 'matched' || !row.studentId) {
      skipped += 1;
      continue;
    }

    const existing = await prisma.studentAchievement.findFirst({
      where: {
        studentId: row.studentId,
        award: row.award,
        exam: row.exam,
        year: row.academicYear,
      },
      select: { id: true, imagePath: true, imageWatermarkedPath: true },
    });

    if (existing && !reupload) {
      skipped += 1;
      continue;
    }

    const achievementId = existing?.id ?? randomUUID();
    const buffer = await fs.readFile(row.filePath);
    const mimetype = mimeFromExt(row.filePath);
    const imagePath =
      existing?.imagePath ??
      `student/${row.studentId}/${achievementId}.${extensionForMime(mimetype)}`;
    const imageWatermarkedPath =
      existing?.imageWatermarkedPath ??
      buildAchievementWatermarkedPath('student', row.studentId, achievementId);

    try {
      const watermarked = await bakeDiagonalWatermark(buffer);
      await uploadStorageObject({
        bucket: ACHIEVEMENT_STORAGE_BUCKET,
        path: imagePath,
        body: buffer,
        contentType: mimetype,
        upsert: true,
      });
      await uploadStorageObject({
        bucket: ACHIEVEMENT_PUBLIC_BUCKET,
        path: imageWatermarkedPath,
        body: watermarked.buffer,
        contentType: watermarked.contentType,
        upsert: true,
      });

      if (existing) {
        if (!existing.imagePath || !existing.imageWatermarkedPath) {
          await prisma.studentAchievement.update({
            where: { id: existing.id },
            data: { imagePath, imageWatermarkedPath },
          });
        }
        reuploaded += 1;
        console.log(
          `REUPLOAD ${row.studentName} | ${row.award} · ${row.exam} → ${row.studentId}`,
        );
      } else {
        const last = await prisma.studentAchievement.findFirst({
          where: { studentId: row.studentId },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        });

        await prisma.studentAchievement.create({
          data: {
            id: achievementId,
            studentId: row.studentId,
            award: row.award,
            exam: row.exam,
            year: row.academicYear,
            level: row.level,
            courseLabel: row.courseLabel,
            imagePath,
            imageWatermarkedPath,
            sortOrder: (last?.sortOrder ?? -1) + 1,
          },
        });
        created += 1;
        console.log(
          `OK ${row.studentName} | ${row.award} · ${row.exam} → ${row.studentId}`,
        );
      }
    } catch (error) {
      failed += 1;
      console.error(
        `FAIL ${row.studentName} | ${row.fileName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return { created, reuploaded, skipped, failed };
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
        `${row.studentFolder} :: ${row.award} - ${row.exam} → candidates: ${row.candidates
          .map((c) => `${c.id} (${c.fullName} / ${c.school ?? '—'})`)
          .join('; ')}`,
      );
    }
  }

  if (unmatched.length > 0) {
    console.log('\n-- Unmatched --');
    const unique = [...new Set(unmatched.map((row) => row.studentFolder))];
    for (const folder of unique) {
      const count = unmatched.filter((row) => row.studentFolder === folder).length;
      console.log(`${folder} (${count} file)`);
    }
  }

  console.log('\n-- Matched sample (first 15) --');
  for (const row of matched.slice(0, 15)) {
    console.log(
      `${row.studentId} | ${row.studentName} | ${row.award} · ${row.exam} | ${row.level} | ${row.courseLabel ?? '—'}`,
    );
  }

  const fingerprint = createHash('sha1')
    .update(
      matches
        .map(
          (row) =>
            `${row.status}|${row.studentId ?? ''}|${row.studentName}|${row.award}|${row.exam}|${row.academicYear}`,
        )
        .sort()
        .join('\n'),
    )
    .digest('hex')
    .slice(0, 12);
  console.log(`\nFingerprint: ${fingerprint}`);
}

async function main() {
  const { dir, apply, reupload } = parseArgs(process.argv.slice(2));
  if (!dir) {
    throw new Error(
      'Missing --dir "/path/to/Học Tin cùng Chuyên Tin"',
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? '(unset)';
  console.log(
    `Target DB host: ${new URL(databaseUrl!).hostname}:${new URL(databaseUrl!).port || '(default)'}`,
  );
  console.log(`SUPABASE_URL: ${supabaseUrl}`);

  const rows = await walkAchievements(dir);
  const matches = await matchStudents(rows);
  printReport(matches);

  if (!apply) {
    console.log(
      '\nDry-run only. Re-run with --apply after reviewing matches to insert into DB + upload images.',
    );
    console.log('Use --apply --reupload to overwrite proof images for existing rows.');
    return;
  }

  const result = await applyImports(matches, reupload);
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
