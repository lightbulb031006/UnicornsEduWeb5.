-- Student achievements: replace freeform `title` with CMS structured fields
-- (award, exam, year, level, course_label) for /thanh-tich landing parity.

CREATE TYPE "AchievementLevel" AS ENUM (
  'COMMUNE',
  'PROVINCE',
  'REGIONAL',
  'NATIONAL',
  'INTERNATIONAL',
  'ADMISSION'
);

ALTER TABLE "student_achievements"
  ADD COLUMN IF NOT EXISTS "award" TEXT,
  ADD COLUMN IF NOT EXISTS "exam" TEXT,
  ADD COLUMN IF NOT EXISTS "year" INTEGER,
  ADD COLUMN IF NOT EXISTS "level" "AchievementLevel",
  ADD COLUMN IF NOT EXISTS "course_label" TEXT;

UPDATE "student_achievements"
SET
  "award" = COALESCE(NULLIF(btrim("title"), ''), '(chưa phân loại)'),
  "exam" = '(chưa phân loại)',
  "year" = COALESCE(EXTRACT(YEAR FROM "created_at")::int, EXTRACT(YEAR FROM now())::int),
  "level" = 'PROVINCE'::"AchievementLevel"
WHERE "award" IS NULL
   OR "exam" IS NULL
   OR "year" IS NULL
   OR "level" IS NULL;

ALTER TABLE "student_achievements"
  ALTER COLUMN "award" SET NOT NULL,
  ALTER COLUMN "exam" SET NOT NULL,
  ALTER COLUMN "year" SET NOT NULL,
  ALTER COLUMN "level" SET NOT NULL;

ALTER TABLE "student_achievements"
  DROP COLUMN IF EXISTS "title";

CREATE INDEX IF NOT EXISTS "student_achievements_year_level_idx"
  ON "student_achievements"("year", "level");
