import { createPublicStorageUrl } from 'src/storage/supabase-storage';
import { ACHIEVEMENT_PUBLIC_BUCKET } from 'src/storage/media-buckets';
import type {
  LandingAchievementDto,
  LandingStudentAchievementDto,
} from 'src/dtos/landing-profile.dto';
import type { AchievementLevel } from 'generated/enums';

type StaffAchievementLandingRow = {
  id: string;
  title: string;
  imageWatermarkedPath: string | null;
  sortOrder: number;
};

type StudentAchievementLandingRow = {
  id: string;
  award: string;
  exam: string;
  year: number;
  level: AchievementLevel;
  courseLabel: string | null;
  imageWatermarkedPath: string | null;
  sortOrder: number;
};

export function deriveStudentAchievementTitle(award: string, exam: string) {
  return `${award.trim()} · ${exam.trim()}`;
}

/** Map staff achievement rows to landing DTOs using watermarked public URLs only. */
export function mapLandingAchievements(
  rows: StaffAchievementLandingRow[],
): LandingAchievementDto[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    imagePath: row.imageWatermarkedPath,
    imageUrl: createPublicStorageUrl({
      bucket: ACHIEVEMENT_PUBLIC_BUCKET,
      path: row.imageWatermarkedPath,
    }),
    sortOrder: row.sortOrder,
  }));
}

/** Map student achievement rows (structured) for landing CMS /thanh-tich sync. */
export function mapLandingStudentAchievements(
  rows: StudentAchievementLandingRow[],
): LandingStudentAchievementDto[] {
  return rows.map((row) => ({
    id: row.id,
    award: row.award,
    exam: row.exam,
    year: row.year,
    level: row.level,
    courseLabel: row.courseLabel,
    title: deriveStudentAchievementTitle(row.award, row.exam),
    imagePath: row.imageWatermarkedPath,
    imageUrl: createPublicStorageUrl({
      bucket: ACHIEVEMENT_PUBLIC_BUCKET,
      path: row.imageWatermarkedPath,
    }),
    sortOrder: row.sortOrder,
  }));
}
