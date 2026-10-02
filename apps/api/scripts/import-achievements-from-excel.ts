/**
 * Import student achievements from the Excel file:
 *   VinhDanh_MonTin_TheoGiai_Nam20252026.xlsx
 *
 * Sheets map to AchievementLevel:
 *   01. HSG Quốc gia → NATIONAL
 *   02. Duyên hải ĐB Bắc Bộ → REGIONAL
 *   03. Trại hè Hùng Vương → REGIONAL
 *   04. HSG Tỉnh-Thành phố → PROVINCE
 *   05. Đỗ Chuyên Tin → ADMISSION
 *   06. Tin học trẻ → REGIONAL
 *   07. Khác → PROVINCE (default, override per row if needed)
 *
 * Usage (from apps/api):
 *   pnpm dlx tsx scripts/import-achievements-from-excel.ts \
 *     --file "/Users/sunny/Downloads/VinhDanh_MonTin_TheoGiai_Nam20252026.xlsx"
 *
 * Dry-run is default. Pass --apply to insert rows.
 */
import 'dotenv/config';
import * as ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { AchievementLevel } from '../generated/enums';

const databaseUrl =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL (or DIRECT_URL) is required.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

type ExcelRow = {
  stt: number;
  name: string;
  grade: string;
  school: string;
  detail: string;
  level: AchievementLevel;
  year: number;
  award: string;
  exam: string;
};

function parseArgs(argv: string[]) {
  let file: string | null = null;
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') apply = true;
    if (arg === '--file') {
      file = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return { file, apply };
}

function normalizeName(value: string) {
  return value
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi');
}

function foldName(value: string) {
  return normalizeName(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd');
}

/** Parse "Giải X - Competition Name" into {award, exam} */
function parseDetail(detail: string): { award: string; exam: string } {
  const cleaned = detail.replace(/\n/g, ' ').trim();
  const sepMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (sepMatch) {
    return { award: sepMatch[1].trim(), exam: sepMatch[2].trim() };
  }
  return { award: cleaned, exam: '' };
}

function inferCourseLabel(grade: string, school: string): string | null {
  const gradeNum = parseInt(grade, 10);
  if (Number.isFinite(gradeNum)) {
    if (gradeNum >= 10) return 'KHỐI THPT';
    if (gradeNum >= 6) return 'KHỐI THCS';
    return 'KHỐI TH';
  }
  const schoolLower = school.toLocaleLowerCase('vi');
  if (/thpt|chuyên|chuyen/.test(schoolLower)) return 'KHỐI THPT';
  if (/thcs|th&thcs/.test(schoolLower)) return 'KHỐI THCS';
  return null;
}

const SHEET_LEVEL_MAP: Record<string, AchievementLevel> = {
  '01. HSG Quốc gia': AchievementLevel.HSG_QUOC_GIA,
  '02. Duyên hải ĐB Bắc Bộ': AchievementLevel.DUYEN_HAI,
  '03. Trại hè Hùng Vương': AchievementLevel.TRAI_HE_HUNG_VUONG,
  '04. HSG Tỉnh-Thành phố': AchievementLevel.HSG_TINH_THANH_PHO,
  '05. Đỗ Chuyên Tin': AchievementLevel.DO_CHUYEN_TIN,
  '06. Tin học trẻ': AchievementLevel.TIN_HOC_TRE,
  '07. Khác': AchievementLevel.KHAC,
};

async function loadExcelData(filePath: string): Promise<ExcelRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const rows: ExcelRow[] = [];

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name;
    let level: AchievementLevel = AchievementLevel.HSG_TINH_THANH_PHO;

    for (const [key, lvl] of Object.entries(SHEET_LEVEL_MAP)) {
      if (sheetName.includes(key) || sheetName.startsWith(key)) {
        level = lvl;
        break;
      }
    }

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return;
      const values = row.values as ExcelJS.CellValue[];
      if (!values || values.length < 5) return;

      const stt = Number(values[1]);
      if (!Number.isFinite(stt)) return;

      const name = String(values[2] ?? '').trim();
      const grade = String(values[3] ?? '').trim();
      const school = String(values[4] ?? '').trim();
      const detail = String(values[5] ?? '').trim();

      if (!name) return;

      const { award, exam } = parseDetail(detail);
      rows.push({
        stt,
        name,
        grade,
        school,
        detail,
        level,
        year: 2025,
        award,
        exam,
      });
    });
  }

  return rows;
}

async function main() {
  const { file, apply } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error('Usage: --file <path-to-excel> [--apply]');
    process.exit(1);
  }

  console.log(`Loading Excel: ${file}`);
  const rows = await loadExcelData(file);
  console.log(`Parsed ${rows.length} achievement rows`);

  // Fetch all students for matching
  const students = await prisma.studentInfo.findMany({
    select: { id: true, fullName: true, school: true, birthYear: true },
  });
  console.log(`Loaded ${students.length} students from DB`);

  const studentMap = new Map<string, typeof students>();
  for (const s of students) {
    const key = foldName(s.fullName);
    if (!studentMap.has(key)) studentMap.set(key, []);
    studentMap.get(key)!.push(s);
  }

  const results: Array<{
    row: ExcelRow;
    status: 'matched' | 'ambiguous' | 'unmatched';
    studentId: string | null;
    candidates: string[];
  }> = [];

  for (const row of rows) {
    const folded = foldName(row.name);
    const candidates = studentMap.get(folded) ?? [];

    if (candidates.length === 0) {
      results.push({ row, status: 'unmatched', studentId: null, candidates: [] });
    } else if (candidates.length === 1) {
      results.push({
        row,
        status: 'matched',
        studentId: candidates[0].id,
        candidates: [candidates[0].fullName],
      });
    } else {
      results.push({
        row,
        status: 'ambiguous',
        studentId: null,
        candidates: candidates.map((c) => c.fullName),
      });
    }
  }

  const matched = results.filter((r) => r.status === 'matched');
  const ambiguous = results.filter((r) => r.status === 'ambiguous');
  const unmatched = results.filter((r) => r.status === 'unmatched');

  console.log(`\nResults:`);
  console.log(`  Matched: ${matched.length}`);
  console.log(`  Ambiguous: ${ambiguous.length}`);
  console.log(`  Unmatched: ${unmatched.length}`);

  if (ambiguous.length > 0) {
    console.log('\nAmbiguous matches:');
    for (const r of ambiguous) {
      console.log(`  ${r.row.name} → ${r.candidates.join(', ')}`);
    }
  }

  if (unmatched.length > 0) {
    console.log('\nUnmatched students:');
    for (const r of unmatched) {
      console.log(`  ${r.row.name} (${r.row.school})`);
    }
  }

  if (!apply) {
    console.log('\nDry run. Pass --apply to insert.');
    return;
  }

  // Insert matched achievements
  let inserted = 0;
  let skipped = 0;

  for (const r of matched) {
    if (!r.studentId) continue;

    // Check if achievement already exists
    const existing = await prisma.studentAchievement.findFirst({
      where: {
        studentId: r.studentId,
        award: r.row.award,
        exam: r.row.exam,
        year: r.row.year,
        level: r.row.level,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.studentAchievement.create({
      data: {
        studentId: r.studentId,
        award: r.row.award,
        exam: r.row.exam,
        year: r.row.year,
        level: r.row.level,
        courseLabel: inferCourseLabel(r.row.grade, r.row.school),
        sortOrder: r.row.stt,
      },
    });
    inserted++;
  }

  console.log(`\nInserted: ${inserted}, Skipped (exists): ${skipped}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
