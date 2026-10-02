// Sync student achievements from the Excel file "VinhDanh_MonTin_TheoGiai_Nam20252026.xlsx"
// into the local DB. Matches students by full_name (case/whitespace-insensitive).
// For each Excel row: finds the student, deletes old achievements for that
// student+exam combo, and upserts the correct record.
//
// Usage: pnpm --filter api exec ts-node -r tsconfig-paths/register scripts/sync-achievements-from-excel.ts

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, AchievementLevel } from '../generated/client';

const databaseUrl =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('DATABASE_URL or DIRECT_URL is required');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

// --- Excel data (extracted from VinhDanh_MonTin_TheoGiai_Nam20252026.xlsx) ---
type ExcelEntry = {
  student: string;
  school: string;
  award: string;
  exam: string;
  level: AchievementLevel;
  year: number;
};

const ENTRIES: ExcelEntry[] = [
  // 01. HSG Quốc gia
  { student: 'Nguyễn Đức Minh', school: 'THPT Chuyên Vĩnh Phúc', award: 'Giải Khuyến khích', exam: 'Học sinh giỏi Quốc gia', level: 'HSG_QUOC_GIA', year: 2025 },
  { student: 'Thân Hoàng Bách', school: 'THPT Chuyên Bắc Giang', award: 'Giải Khuyến khích', exam: 'Học sinh giỏi Quốc gia', level: 'HSG_QUOC_GIA', year: 2025 },

  // 02. Duyên hải ĐB Bắc Bộ
  { student: 'Nguyễn Chí Minh', school: 'THPT Chuyên KHTN', award: 'Huy chương Bạc', exam: 'Duyên hải và Đồng bằng Bắc Bộ (Tin học 10)', level: 'DUYEN_HAI', year: 2025 },
  { student: 'Nguyễn Đức Minh', school: 'THPT Chuyên Vĩnh Phúc', award: 'Huy chương Đồng', exam: 'Duyên hải và Đồng bằng Bắc Bộ (Tin học 11)', level: 'DUYEN_HAI', year: 2025 },
  { student: 'Thân Hoàng Bách', school: 'THPT Chuyên Bắc Giang', award: 'Huy chương Đồng', exam: 'Duyên hải và Đồng bằng Bắc Bộ (Tin học 11)', level: 'DUYEN_HAI', year: 2025 },

  // 03. Trại hè Hùng Vương
  { student: 'Thân Hoàng Bách', school: 'THPT Chuyên Bắc Giang', award: 'Huy chương Bạc', exam: 'Trại hè Hùng Vương (Tin học 10)', level: 'TRAI_HE_HUNG_VUONG', year: 2025 },

  // 04. HSG Tỉnh-Thành phố
  { student: 'Nguyễn Đức Minh', school: 'THPT Chuyên Vĩnh Phúc', award: 'Giải Nhất', exam: 'Học sinh giỏi THPT tỉnh Phú Thọ', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Nguyễn Minh Khôi', school: 'THPT Chuyên Thái Nguyên', award: 'Giải Nhì', exam: 'Học sinh giỏi lớp 10 tỉnh Thái Nguyên', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Thân Hoàng Bách', school: 'THPT Chuyên Bắc Giang', award: 'Giải Ba', exam: 'Học sinh giỏi THPT tỉnh Bắc Ninh', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Nguyễn Tùng Lâm', school: 'THPT Chuyên Thái Nguyên', award: 'Giải Khuyến khích', exam: 'Học sinh giỏi lớp 10 tỉnh Thái Nguyên', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Nguyễn Nhật Nam', school: 'THPT Chuyên Nguyễn Tất Thành', award: 'Giải Khuyến khích', exam: 'Học sinh giỏi THPT tỉnh Lào Cai', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Nguyễn Đức Phúc Nguyên', school: 'THPT Chuyên Lê Khiết', award: 'Giải Khuyến khích', exam: 'Học sinh giỏi THPT tỉnh Lào Cai', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Dương Bình Minh Triết', school: 'THCS Lý Tự Trọng', award: 'Giải Nhì', exam: 'Học sinh giỏi THCS tỉnh Phú Thọ', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Trần Khánh Nguyên', school: 'THCS Lương Thế Vinh', award: 'Giải Nhì', exam: 'Học sinh giỏi lớp 9 Thành phố Hồ Chí Minh', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Nguyễn Đức Bình', school: 'THCS Sài Sơn', award: 'Giải Nhì', exam: 'Học sinh giỏi Tin học lớp 9 Thành phố Hà Nội', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Trần Bảo Ngọc', school: 'THCS Võ Văn Tần', award: 'Giải Ba', exam: 'Học sinh giỏi THCS tỉnh Tây Ninh', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Nguyễn Tuấn Khanh', school: 'THCS Hoàng Lâu', award: 'Giải Ba', exam: 'Học sinh giỏi THCS tỉnh Phú Thọ', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Nguyễn Hải Đăng', school: 'THCS Đồng Tiến', award: 'Giải Ba', exam: 'Học sinh giỏi THCS tỉnh Phú Thọ', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Bùi Nhật Minh', school: 'THCS Lữ Gia', award: 'Giải Ba', exam: 'Học sinh giỏi lớp 9 Thành phố Hồ Chí Minh', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Trần Quốc Bảo', school: 'THCS Phú Thái', award: 'Giải Ba', exam: 'Học sinh giỏi lớp 9 Thành phố Hải Phòng', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Trần Hoàng Long', school: 'THCS số 1 Nam Lý', award: 'Giải Ba', exam: 'Học sinh giỏi lớp 9 tỉnh Quảng Trị', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Phan Trí Vinh', school: 'THCS&THPT Nguyễn Tất Thành', award: 'Giải Ba', exam: 'Học sinh giỏi Tin học lớp 9 Thành phố Hà Nội', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Nguyễn Tiến Dũng', school: 'THCS Hoàng Lâu', award: 'Giải Khuyến khích', exam: 'Học sinh giỏi THCS tỉnh Phú Thọ', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Đào Trung Phong', school: 'TH&THCS Nhuế Dương', award: 'Giải Khuyến khích', exam: 'Học sinh giỏi THCS tỉnh Hưng Yên', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Hoàng Hải Nam', school: 'THCS Tân Hòa', award: 'Giải Khuyến khích', exam: 'Học sinh giỏi THCS tỉnh Hưng Yên', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Đinh Bình An', school: 'THCS Tam Dương', award: 'Giải Khuyến khích', exam: 'Học sinh giỏi THCS tỉnh Phú Thọ', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Ngô Tuấn Anh', school: 'THCS Dương Tiến', award: 'Giải Khuyến khích', exam: 'Học sinh giỏi THCS tỉnh Hưng Yên', level: 'HSG_TINH_THANH_PHO', year: 2025 },
  { student: 'Cao Minh Bảo', school: 'THCS Lý Nhật Quang', award: 'Giải Khuyến khích', exam: 'Học sinh giỏi THCS tỉnh Nghệ An', level: 'HSG_TINH_THANH_PHO', year: 2025 },

  // 05. Đỗ Chuyên Tin
  { student: 'Dương Hải Lân', school: 'THCS Trưng Vương', award: 'Đỗ Chuyên Tin', exam: 'THPT Chuyên Đại học Sư phạm Hà Nội', level: 'DO_CHUYEN_TIN', year: 2025 },
  { student: 'Nguyễn Minh Quân', school: 'THCS&THPT Trí Đức', award: 'Đỗ Chuyên Tin', exam: 'THPT Chuyên Phổ thông Năng khiếu, ĐHQG TP.HCM', level: 'DO_CHUYEN_TIN', year: 2025 },
  { student: 'Nguyễn Minh Quân', school: 'THCS&THPT Trí Đức', award: 'Đỗ Chuyên Tin', exam: 'THPT Chuyên Lê Hồng Phong', level: 'DO_CHUYEN_TIN', year: 2025 },
  { student: 'Dương Bình Minh Triết', school: 'THCS Lý Tự Trọng', award: 'Đỗ Chuyên Tin', exam: 'THPT Chuyên Vĩnh Phúc', level: 'DO_CHUYEN_TIN', year: 2025 },
  { student: 'Nguyễn Tiến Dũng', school: 'THCS Hoàng Lâu', award: 'Đỗ Chuyên Tin', exam: 'THPT Chuyên Vĩnh Phúc', level: 'DO_CHUYEN_TIN', year: 2025 },
  { student: 'Trần Bảo Ngọc', school: 'THCS Võ Văn Tần', award: 'Đỗ Chuyên Tin', exam: 'THPT Chuyên Trần Văn Giàu', level: 'DO_CHUYEN_TIN', year: 2025 },
  { student: 'Đào Trung Phong', school: 'TH&THCS Nhuế Dương', award: 'Đỗ Chuyên Tin', exam: 'THPT Chuyên Hưng Yên', level: 'DO_CHUYEN_TIN', year: 2025 },
  { student: 'Hoàng Hải Nam', school: 'THCS Tân Hòa', award: 'Đỗ Chuyên Tin', exam: 'THPT Chuyên Hưng Yên', level: 'DO_CHUYEN_TIN', year: 2025 },
  { student: 'Lê Đặng Trần Phong', school: 'THCS&THPT Trí Đức', award: 'Đỗ Chuyên Tin', exam: 'THPT Chuyên Lê Hồng Phong', level: 'DO_CHUYEN_TIN', year: 2025 },
  { student: 'Lê Đặng Trần Phong', school: 'THCS&THPT Trí Đức', award: 'Đỗ Chuyên Tin', exam: 'THPT Chuyên Lê Quý Đôn', level: 'DO_CHUYEN_TIN', year: 2025 },
  { student: 'Tạ Hữu Đức Mạnh', school: 'THCS Liên Bảo', award: 'Đỗ Chuyên Tin', exam: 'THPT Chuyên Vĩnh Phúc', level: 'DO_CHUYEN_TIN', year: 2025 },
  { student: 'Lê Minh Triết', school: 'THCS Hùng Vương', award: 'Đỗ Chuyên Tin', exam: 'THPT Chuyên Huỳnh Mẫn Đạt', level: 'DO_CHUYEN_TIN', year: 2025 },

  // 06. Tin học trẻ
  { student: 'Đàm Khánh Duy', school: 'THCS Nguyễn Tất Thành', award: 'Hạng 10 khu vực miền Bắc', exam: 'Bảng B, Vòng loại Hội thi Tin học trẻ', level: 'TIN_HOC_TRE', year: 2025 },
  { student: 'Bùi Nhật Minh', school: 'THCS Lữ Gia', award: 'Hạng 23 khu vực miền Nam', exam: 'Bảng B, Vòng loại Hội thi Tin học trẻ', level: 'TIN_HOC_TRE', year: 2025 },

  // 07. Khác
  { student: 'Đào Hải Lâm', school: 'THPT Xuân Đỉnh', award: 'Giải Nhì', exam: 'Olympic liên cụm THPT Hà Nội (lớp 10)', level: 'KHAC', year: 2025 },
  { student: 'Nguyễn Công Minh Tâm', school: 'THPT Liên Hà', award: 'Giải Ba', exam: 'Olympic liên cụm THPT Hà Nội (lớp 11)', level: 'KHAC', year: 2025 },
  { student: 'Dương Nhật Minh', school: 'THPT Tạ Quang Bửu', award: 'Giải Khuyến khích', exam: 'Olympic liên cụm THPT Hà Nội (lớp 11)', level: 'KHAC', year: 2025 },
  { student: 'Dương Nhật Minh', school: 'THPT Tạ Quang Bửu', award: 'Giải Nhì', exam: 'Học sinh giỏi cấp trường', level: 'KHAC', year: 2025 },
  { student: 'Trần Đức Mạnh', school: 'THPT Chuyên Vĩnh Phúc', award: 'Giải Nhất', exam: 'Hội thi Trí tuệ Tây Thiên Lần thứ I (Tin học 10)', level: 'KHAC', year: 2025 },
  { student: 'Nguyễn Đức Minh', school: 'THPT Chuyên Vĩnh Phúc', award: 'Giải Nhì', exam: 'Hội thi Trí tuệ Tây Thiên Lần thứ I (Tin học 11)', level: 'KHAC', year: 2025 },
  { student: 'Nguyễn Văn Hùng', school: 'THPT Chuyên Vĩnh Phúc', award: 'Giải Ba', exam: 'Hội thi Trí tuệ Tây Thiên Lần thứ I (Tin học 10)', level: 'KHAC', year: 2025 },
  { student: 'Hoàng Thị Hồng Liên', school: 'THPT Chuyên Vĩnh Phúc', award: 'Giải Ba', exam: 'Hội thi Trí tuệ Tây Thiên Lần thứ I (Tin học 10)', level: 'KHAC', year: 2025 },
  { student: 'Nguyễn Đức Thắng', school: 'THPT Chuyên Vĩnh Phúc', award: 'Giải Ba', exam: 'Hội thi Trí tuệ Tây Thiên Lần thứ I (Tin học 10)', level: 'KHAC', year: 2025 },
  { student: 'Trần Duy Anh', school: 'THPT Chuyên Vĩnh Phúc', award: 'Giải Khuyến khích', exam: 'Hội thi Trí tuệ Tây Thiên Lần thứ I (Tin học 10)', level: 'KHAC', year: 2025 },
  { student: 'Nguyễn Đức Bình', school: 'THCS Sài Sơn', award: 'Giải Nhất', exam: 'Học sinh giỏi cấp xã', level: 'KHAC', year: 2025 },
  { student: 'Nguyễn Tuấn Khanh', school: 'THCS Hoàng Lâu', award: 'Giải Nhì', exam: 'Học sinh giỏi cấp xã', level: 'KHAC', year: 2025 },
  { student: 'Đinh Bình An', school: 'THCS Tam Dương', award: 'Giải Nhì', exam: 'Học sinh giỏi cấp xã', level: 'KHAC', year: 2025 },
  { student: 'Vũ Bình Nguyên', school: 'THCS Lý Tự Trọng', award: 'Giải Nhì', exam: 'Học sinh giỏi cấp xã', level: 'KHAC', year: 2025 },
  { student: 'Nguyễn Hải Đăng', school: 'THCS Đồng Tiến', award: 'Giải Nhì', exam: 'Học sinh giỏi lớp 9 phường Hòa Bình', level: 'KHAC', year: 2025 },
  { student: 'Trần Bảo Ngọc', school: 'THCS Võ Văn Tần', award: 'Giải Nhất', exam: 'Học sinh giỏi cấp trường', level: 'KHAC', year: 2025 },
  { student: 'Trần Hoàng Long', school: 'THCS số 1 Nam Lý', award: 'Giải Nhất', exam: 'Học sinh giỏi cấp trường', level: 'KHAC', year: 2025 },
  { student: 'Vũ Đức Thành', school: 'THCS Trần Phú', award: 'Giải Nhất', exam: 'Học sinh giỏi cấp trường', level: 'KHAC', year: 2025 },
  { student: 'Lê Huy Phú', school: 'Trung học Thực hành Sài Gòn', award: 'Giải Nhất', exam: 'Học sinh giỏi cấp trường', level: 'KHAC', year: 2025 },
  { student: 'Nguyễn Ngọc Nam Phương', school: 'THCS Nguyễn Khuyến', award: 'Giải Nhất', exam: 'Học sinh giỏi cấp trường', level: 'KHAC', year: 2025 },
  { student: 'Vũ Bình Nguyên', school: 'THCS Lý Tự Trọng', award: 'Giải Nhì', exam: 'Kỳ thi giao lưu Học sinh giỏi lớp 8 liên trường', level: 'KHAC', year: 2025 },
];

function normalizeName(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase('vi-VN')
    .replace(/\s+/g, ' ');
}

function normalizeSchool(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase('vi-VN')
    .replace(/\s+/g, ' ')
    .replace(/&/g, ' và ')
    .replace(/thcs&thpt/g, 'thcs thpt')
    .replace(/th&thcs/g, 'th thcs');
}

async function main() {
  // Step 1: Load all students
  const students = await prisma.studentInfo.findMany({
    select: { id: true, fullName: true, school: true },
  });

  const studentMap = new Map<string, { id: string; fullName: string; school: string | null }[]>();
  for (const s of students) {
    const key = normalizeName(s.fullName);
    const list = studentMap.get(key) ?? [];
    list.push(s);
    studentMap.set(key, list);
  }

  // Step 2: Group Excel entries by student name
  const entriesByStudent = new Map<string, ExcelEntry[]>();
  for (const entry of ENTRIES) {
    const key = normalizeName(entry.student);
    const list = entriesByStudent.get(key) ?? [];
    list.push(entry);
    entriesByStudent.set(key, list);
  }

  const matched = new Set<string>();
  const unmatched = new Set<string>();
  let upsertCount = 0;
  let deleteCount = 0;

  for (const [nameKey, entries] of entriesByStudent) {
    const candidates = studentMap.get(nameKey);
    if (!candidates || candidates.length === 0) {
      unmatched.add(entries[0].student);
      console.log(`  [MISS] Student not found: ${entries[0].student}`);
      continue;
    }

    matched.add(nameKey);

    // Pick the best candidate: exact school match first, then first match
    let target = candidates[0];
    if (candidates.length > 1) {
      for (const c of candidates) {
        if (c.school && normalizeSchool(c.school) === normalizeSchool(entries[0].school)) {
          target = c;
          break;
        }
      }
    }

    console.log(`  [OK] ${entries[0].student} → ${target.fullName} (${target.id}) [${entries.length} achievements]`);

    // For each entry, check if it already exists
    for (const entry of entries) {
      const existing = await prisma.studentAchievement.findFirst({
        where: {
          studentId: target.id,
          exam: entry.exam,
        },
      });

      if (existing) {
        // Update if different
        const needsUpdate =
          existing.award !== entry.award ||
          existing.level !== entry.level ||
          existing.year !== entry.year;

        if (needsUpdate) {
          await prisma.studentAchievement.update({
            where: { id: existing.id },
            data: {
              award: entry.award,
              exam: entry.exam,
              year: entry.year,
              level: entry.level,
            },
          });
          upsertCount++;
          console.log(`    [UPD] ${entry.award} - ${entry.exam} (${entry.level})`);
        } else {
          console.log(`    [SKIP] ${entry.award} - ${entry.exam} (already correct)`);
        }
      } else {
        // Create new
        await prisma.studentAchievement.create({
          data: {
            studentId: target.id,
            award: entry.award,
            exam: entry.exam,
            year: entry.year,
            level: entry.level,
          },
        });
        upsertCount++;
        console.log(`    [NEW] ${entry.award} - ${entry.exam} (${entry.level})`);
      }
    }
  }

  // Step 3: Find and remove achievements that are NOT in the Excel
  // (old/incorrect records that don't match any Excel entry)
  const allAchievements = await prisma.studentAchievement.findMany({
    include: { student: { select: { fullName: true } } },
  });

  // Build a set of (studentName, exam) pairs from Excel
  const excelPairs = new Set<string>();
  for (const entry of ENTRIES) {
    excelPairs.add(`${normalizeName(entry.student)}::${entry.exam}`);
  }

  for (const ach of allAchievements) {
    const pair = `${normalizeName(ach.student.fullName)}::${ach.exam}`;
    if (!excelPairs.has(pair)) {
      // Check if this is a "duplicate" old record that should be removed
      // Only remove if the student has a matching Excel entry (i.e., we already processed them)
      const studentKey = normalizeName(ach.student.fullName);
      if (matched.has(studentKey)) {
        await prisma.studentAchievement.delete({ where: { id: ach.id } });
        deleteCount++;
        console.log(`  [DEL] ${ach.student.fullName}: "${ach.award}" - "${ach.exam}" (not in Excel)`);
      }
    }
  }

  console.log(`\nDone! Upserted: ${upsertCount}, Deleted: ${deleteCount}`);
  console.log(`Matched students: ${matched.size}, Unmatched: ${unmatched.size}`);
  if (unmatched.size > 0) {
    console.log(`Unmatched student names: ${[...unmatched].join(', ')}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
